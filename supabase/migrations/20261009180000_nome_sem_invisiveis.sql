-- Migration de correção (portão de segurança). Não edita as anteriores.
--
-- Caracteres invisíveis (largura zero U+200B-200F, controles bidi U+202A-202E,
-- U+2060-2064 e BOM U+FEFF) passavam como "nome" ou "motivo" e dava para criar
-- agendamento com nome aparentemente vazio, ou bagunçar a direção do texto na tela.
--   * criar_agendamento: remove esses caracteres ANTES de colapsar espaços e medir,
--     e exige pelo menos 2 letras ([[:alpha:]], qualquer alfabeto). Erro: URB03.
--   * criar_bloqueio: remove os mesmos invisíveis do motivo.
-- create or replace mantém os grants; reafirmados no fim de cada função.

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

  -- Nome: 1) remove caracteres invisíveis; 2) controle e espaços repetidos viram um
  -- espaço só; 3) tira as pontas; 4) mede 2 a 60 caracteres; 5) exige 2 letras
  -- (de qualquer alfabeto), então um nome só de invisíveis ou "1 2" não passa.
  v_nome := btrim(regexp_replace(
    regexp_replace(p_nome, '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g'),
    '[[:cntrl:][:space:]]+', ' ', 'g'));
  if char_length(v_nome) < 2 or char_length(v_nome) > 60
     or char_length(regexp_replace(v_nome, '[^[:alpha:]]', '', 'g')) < 2 then
    raise exception 'O nome precisa ter de 2 a 60 caracteres, com pelo menos 2 letras.' using errcode = 'URB03';
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

create or replace function public.criar_bloqueio(
  p_barbeiro_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text default ''
)
returns table (id uuid, conflitos integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_motivo text;
  v_periodo tstzrange;
  v_id uuid;
  v_conflitos integer;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Fim depois do início, no máximo 14 dias, e que ainda não tenha terminado.
  if p_inicio is null or p_fim is null or p_fim <= p_inicio
     or p_fim - p_inicio > interval '14 days'
     or p_fim <= now() then
    raise exception 'Período do bloqueio inválido (o fim precisa ser depois do início e no futuro, máximo de 14 dias).'
      using errcode = 'URB12';
  end if;

  -- Motivo: invisíveis removidos; controle e espaços repetidos viram um espaço; até 120 caracteres.
  v_motivo := btrim(regexp_replace(
    regexp_replace(coalesce(p_motivo, ''), '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g'),
    '[[:cntrl:][:space:]]+', ' ', 'g'));
  if char_length(v_motivo) > 120 then
    raise exception 'O motivo pode ter até 120 caracteres.' using errcode = 'URB13';
  end if;

  if p_barbeiro_id is not null
     and not exists (select 1 from public.barbeiros b where b.id = p_barbeiro_id) then
    raise exception 'Barbeiro não encontrado.' using errcode = 'URB14';
  end if;

  v_periodo := tstzrange(p_inicio, p_fim, '[)');

  insert into public.bloqueios (barbeiro_id, periodo, motivo)
  values (p_barbeiro_id, v_periodo, v_motivo)
  returning public.bloqueios.id into v_id;

  select count(*)::int into v_conflitos
  from public.agendamentos a
  where a.status in ('pendente', 'confirmado')
    and a.periodo && v_periodo
    and (p_barbeiro_id is null or a.barbeiro_id = p_barbeiro_id);

  return query select v_id, v_conflitos;
end;
$$;
revoke execute on function public.criar_bloqueio(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.criar_bloqueio(uuid, timestamptz, timestamptz, text) to authenticated;
