-- Migration de correção (após revisão do crítico): refaz criar_agendamento
-- com "create or replace". A migration anterior não é editada.
--
-- MUDANÇAS:
--   1) Telefone CANÔNICO. Depois de remover espaços, "(", ")", "-" e "+":
--        * 10 ou 11 dígitos (DDD + número)  -> prefixa "55" (Brasil);
--        * 12 ou 13 dígitos                 -> precisa começar com "55", senão URB04;
--        * qualquer outro tamanho ou caractere -> URB04.
--      A forma canônica (sempre com 55) é a que vale para TUDO: gravar,
--      travar (advisory lock) e contar pendentes. Assim "(11) 99999-0000" e
--      "+55 11 99999-0000" são o mesmo telefone para o limite anti-spam, e o
--      painel monta o link wa.me direto com o número gravado.
--   2) Nome: caracteres de controle (quebra de linha, tab etc.) viram espaço e
--      espaços repetidos são colapsados em um só, ANTES de medir 2 a 60.
--   3) Novo erro URB09 "tente de novo": acontece se o código curto colidir 5 vezes
--      seguidas (quase impossível). Antes caía em URB07, que significa outra coisa.
--
-- LISTA COMPLETA DE ERROS (inalterada, mais o URB09):
--   URB01 serviço inválido | URB02 barbeiro inválido | URB03 nome inválido
--   URB04 telefone inválido | URB05 horário indisponível | URB06 limite de pendentes
--   URB07 horário acabou de ser ocupado | URB08 parâmetro ausente
--   URB09 não foi possível gerar o código; tentar de novo

create or replace function public.criar_agendamento(
  p_servico text,
  p_barbeiro text,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text
)
returns table (codigo text, barbeiro_nome text, servico_nome text, inicio timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servico public.servicos%rowtype;
  v_barbeiro_id uuid;
  v_nome text;
  v_tel text;
  v_max_pendentes integer;
  v_dia date;
  v_dia_ini timestamptz;
  v_candidato record;
  v_tentativa integer;
  v_achou_livre boolean := false;
  v_codigo_esgotou boolean := false;
  v_codigo text;
  v_barbeiro_nome text;
begin
  if p_servico is null or p_inicio is null or p_nome is null or p_telefone is null then
    raise exception 'Preencha todos os campos.' using errcode = 'URB08';
  end if;

  -- Nome: controle e espaços repetidos viram um espaço só; depois tira as pontas.
  v_nome := btrim(regexp_replace(p_nome, '[[:cntrl:][:space:]]+', ' ', 'g'));
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    raise exception 'O nome precisa ter de 2 a 60 caracteres.' using errcode = 'URB03';
  end if;

  -- Telefone: limpa símbolos de digitação e normaliza para a forma canônica (com 55).
  v_tel := regexp_replace(p_telefone, '[\s()+-]', '', 'g');
  if v_tel ~ '^[0-9]{10,11}$' then
    v_tel := '55' || v_tel;
  elsif v_tel !~ '^55[0-9]{10,11}$' then
    -- Sobrou: não é número, ou tem 12 a 13 dígitos sem começar com 55, ou tamanho errado.
    raise exception 'Telefone inválido. Use DDD + número.' using errcode = 'URB04';
  end if;

  select * into v_servico from public.servicos s where s.slug = p_servico and s.ativo;
  if v_servico.id is null then
    raise exception 'Serviço não encontrado.' using errcode = 'URB01';
  end if;

  if p_barbeiro is not null then
    select b.id into v_barbeiro_id
    from public.barbeiros b where b.slug = p_barbeiro and b.ativo;
    if v_barbeiro_id is null then
      raise exception 'Barbeiro não encontrado.' using errcode = 'URB02';
    end if;
  end if;

  -- Trava por telefone (forma canônica) até o fim da transação: duas chamadas
  -- simultâneas do mesmo número esperam uma pela outra, então o limite não é furado.
  perform pg_advisory_xact_lock(hashtextextended('urbz:tel:' || v_tel, 0));

  -- Regra 6 (anti-spam): só pendentes que ainda não aconteceram contam.
  select c.max_pendentes_por_telefone into v_max_pendentes from public.config c;
  if (
    select count(*) from public.agendamentos a
    where a.cliente_telefone = v_tel
      and a.status = 'pendente'
      and upper(a.periodo) > now()
  ) >= v_max_pendentes then
    raise exception 'Você já tem agendamentos pendentes demais. Confirme ou cancele algum antes de marcar outro.'
      using errcode = 'URB06';
  end if;

  v_dia := (p_inicio at time zone 'America/Sao_Paulo')::date;
  v_dia_ini := v_dia::timestamp at time zone 'America/Sao_Paulo';

  -- Candidatos: barbeiros livres NESTE horário exato, pela MESMA lógica de
  -- horarios_disponiveis. Sem preferência: menos atendimentos no dia primeiro;
  -- empate pela ordem do barbeiro.
  for v_candidato in
    select l.barbeiro_id as bid, b.nome as bnome
    from public._slots_livres(v_servico.id, v_dia, v_barbeiro_id) l
    join public.barbeiros b on b.id = l.barbeiro_id
    where l.inicio = p_inicio
    order by
      (select count(*) from public.agendamentos a
        where a.barbeiro_id = l.barbeiro_id
          and a.status <> 'cancelado'
          and lower(a.periodo) >= v_dia_ini
          and lower(a.periodo) < v_dia_ini + interval '1 day'),
      b.ordem,
      b.id
  loop
    v_achou_livre := true;

    -- Código curto: se por azar já existir, tenta outro (até 5 vezes).
    for v_tentativa in 1..5 loop
      begin
        insert into public.agendamentos
          (servico_id, barbeiro_id, cliente_nome, cliente_telefone, periodo)
        values
          (v_servico.id, v_candidato.bid, v_nome, v_tel,
           tstzrange(p_inicio, p_inicio + make_interval(mins => v_servico.duracao_min), '[)'))
        returning public.agendamentos.codigo into v_codigo;

        v_barbeiro_nome := v_candidato.bnome;
        return query select v_codigo, v_barbeiro_nome, v_servico.nome, p_inicio;
        return;
      exception
        when unique_violation then
          -- Código repetido: o loop tenta de novo. Na 5ª vez, anota que esgotou.
          if v_tentativa = 5 then
            v_codigo_esgotou := true;
          end if;
        when exclusion_violation then
          -- Outro cliente pegou este barbeiro neste instante. Sai do loop interno
          -- e tenta o próximo barbeiro livre (sem preferência), se houver.
          exit;
      end;
    end loop;
  end loop;

  if v_codigo_esgotou then
    raise exception 'Não foi possível gerar o código do agendamento. Tente de novo.' using errcode = 'URB09';
  end if;
  if v_achou_livre then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = 'URB07';
  end if;
  raise exception 'Horário indisponível. Escolha outro.' using errcode = 'URB05';
end;
$$;

-- create or replace preserva os grants, mas reafirmamos para não depender disso.
revoke execute on function public.criar_agendamento(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento(text, text, timestamptz, text, text) to anon, authenticated;
