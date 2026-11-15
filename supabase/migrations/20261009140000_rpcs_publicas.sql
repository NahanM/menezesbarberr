-- Migration: as duas funções públicas (RPC) que o visitante anônimo pode chamar.
--
--   horarios_disponiveis(p_servico, p_dia, p_barbeiro)  -> lista de inícios livres
--   criar_agendamento(p_servico, p_barbeiro, p_inicio, p_nome, p_telefone)
--
-- Toda regra de negócio fica aqui no banco (CLAUDE.md). O front só mostra.
--
-- ERROS (o front mapeia pelo código SQLSTATE; a mensagem já vem em português):
--   URB01  serviço inexistente ou inativo
--   URB02  barbeiro inexistente ou inativo
--   URB03  nome inválido (2 a 60 caracteres)
--   URB04  telefone inválido (10 a 13 dígitos)
--   URB05  horário indisponível (fora do funcionamento, passado, almoço,
--          sem antecedência, além da janela, não cabe no expediente, etc.)
--   URB06  limite de agendamentos pendentes deste telefone atingido
--   URB07  horário acabou de ser ocupado (corrida com outro cliente)
--   URB08  parâmetro obrigatório ausente
--
-- DECISÕES:
--   * Slug inválido em horarios_disponiveis dá ERRO (URB01/URB02), não lista vazia:
--     lista vazia significa "dia lotado/fechado", e isso não deve se confundir com bug.
--   * Telefone: removemos só espaços, "(", ")", "-" e "+" (o que a pessoa digita
--     naturalmente) e DEPOIS validamos 10 a 13 dígitos. Letras e outros símbolos
--     são rejeitados, nunca apagados em silêncio.
--   * Nome: tiramos espaços das pontas (trim) e validamos 2 a 60 caracteres.

-- ===============================================================
-- Função interna: todos os pares (início, barbeiro) LIVRES num dia.
-- É a ÚNICA fonte da lógica de disponibilidade: horarios_disponiveis
-- e criar_agendamento usam a mesma, então nunca discordam.
-- Ninguém de fora chama (sem grant); as funções públicas abaixo são
-- security definer e a chamam com os poderes do dono.
-- ===============================================================
create function public._slots_livres(p_servico_id uuid, p_dia date, p_barbeiro_id uuid)
returns table (inicio timestamptz, barbeiro_id uuid)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select intervalo_slots_min, antecedencia_min_minutos, janela_max_dias
    from public.config
  ),
  srv as (
    select duracao_min from public.servicos where id = p_servico_id and ativo
  ),
  -- Funcionamento do dia da semana de p_dia (0 = domingo). Sem linha = fechado = vazio.
  dia as (
    select f.abre, f.fecha, f.almoco_inicio, f.almoco_fim
    from public.funcionamento f
    where f.dia_semana = extract(dow from p_dia)::int
  ),
  -- "Hoje" no fuso de São Paulo (e não no do servidor, que é UTC).
  hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as d
  ),
  -- Candidatos: de "abre" em passos da grade. Horários em hora LOCAL (timestamp
  -- sem fuso) para comparar com abre/fecha/almoço, que são horas do relógio.
  candidatos as (
    select
      p_dia + d.abre + (n * make_interval(mins => c.intervalo_slots_min)) as ini_local,
      p_dia + d.abre + (n * make_interval(mins => c.intervalo_slots_min))
        + make_interval(mins => s.duracao_min) as fim_local,
      p_dia + d.fecha as fecha_local,
      p_dia + d.almoco_inicio as almoco_ini_local,
      p_dia + d.almoco_fim as almoco_fim_local,
      c.antecedencia_min_minutos,
      s.duracao_min
    from cfg c, srv s, dia d, hoje h,
         generate_series(0, 1440 / c.intervalo_slots_min) as n
    -- Janela: nada no passado (dia anterior a hoje) e nada além do máximo de dias.
    where p_dia >= h.d and p_dia <= h.d + c.janela_max_dias
  ),
  -- Regra 2: o atendimento inteiro cabe até o fechamento e não invade o almoço.
  validos as (
    select
      (ini_local at time zone 'America/Sao_Paulo') as ini,
      duracao_min
    from candidatos
    where fim_local <= fecha_local
      and (
        almoco_ini_local is null
        or not (ini_local < almoco_fim_local and fim_local > almoco_ini_local)
      )
  )
  select v.ini, b.id
  from validos v
  cross join public.barbeiros b
  where b.ativo
    and (p_barbeiro_id is null or b.id = p_barbeiro_id)
    -- Regra 3: antecedência mínima (também elimina horários já passados de hoje).
    and v.ini >= now() + make_interval(mins => (select antecedencia_min_minutos from public.config))
    -- Regra 4: sem sobreposição com outro atendimento do barbeiro (cancelado não conta)...
    and not exists (
      select 1 from public.agendamentos a
      where a.barbeiro_id = b.id
        and a.status <> 'cancelado'
        and a.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    )
    -- ...nem com bloqueio dele ou da barbearia inteira (barbeiro_id nulo).
    and not exists (
      select 1 from public.bloqueios k
      where (k.barbeiro_id is null or k.barbeiro_id = b.id)
        and k.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    );
$$;
revoke execute on function public._slots_livres(uuid, date, uuid) from public, anon, authenticated;

-- ===============================================================
-- horarios_disponiveis: devolve só os inícios livres (nenhum dado de cliente).
-- p_barbeiro nulo = "sem preferência": o horário entra se ALGUM barbeiro estiver livre.
-- ===============================================================
create function public.horarios_disponiveis(
  p_servico text,
  p_dia date,
  p_barbeiro text default null
)
returns table (inicio timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_servico_id uuid;
  v_barbeiro_id uuid;
begin
  if p_servico is null or p_dia is null then
    raise exception 'Informe o serviço e o dia.' using errcode = 'URB08';
  end if;

  select s.id into v_servico_id
  from public.servicos s where s.slug = p_servico and s.ativo;
  if v_servico_id is null then
    raise exception 'Serviço não encontrado.' using errcode = 'URB01';
  end if;

  if p_barbeiro is not null then
    select b.id into v_barbeiro_id
    from public.barbeiros b where b.slug = p_barbeiro and b.ativo;
    if v_barbeiro_id is null then
      raise exception 'Barbeiro não encontrado.' using errcode = 'URB02';
    end if;
  end if;

  return query
    select distinct l.inicio
    from public._slots_livres(v_servico_id, p_dia, v_barbeiro_id) l
    order by 1;
end;
$$;
revoke execute on function public.horarios_disponiveis(text, date, text) from public, anon, authenticated;
grant execute on function public.horarios_disponiveis(text, date, text) to anon, authenticated;

-- ===============================================================
-- criar_agendamento: valida tudo no servidor e grava como PENDENTE.
-- Devolve só o necessário para a tela de sucesso e a mensagem do WhatsApp.
-- ===============================================================
create function public.criar_agendamento(
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
  v_codigo text;
  v_barbeiro_nome text;
begin
  if p_servico is null or p_inicio is null or p_nome is null or p_telefone is null then
    raise exception 'Preencha todos os campos.' using errcode = 'URB08';
  end if;

  -- Nome e telefone primeiro: são baratos e não dependem do banco.
  v_nome := btrim(p_nome);
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    raise exception 'O nome precisa ter de 2 a 60 caracteres.' using errcode = 'URB03';
  end if;

  v_tel := regexp_replace(p_telefone, '[\s()+-]', '', 'g');
  if v_tel !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido. Use DDD + número (10 a 13 dígitos).' using errcode = 'URB04';
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

  -- Trava por telefone até o fim da transação: duas chamadas simultâneas do mesmo
  -- número esperam uma pela outra, então o limite de pendentes não é furado.
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

  -- Dia (em São Paulo) do horário pedido, e o início desse dia, para o desempate abaixo.
  v_dia := (p_inicio at time zone 'America/Sao_Paulo')::date;
  v_dia_ini := v_dia::timestamp at time zone 'America/Sao_Paulo';

  -- Candidatos: barbeiros livres NESTE horário exato, segundo a MESMA lógica de
  -- horarios_disponiveis. Se p_inicio não for um horário válido (regras 1, 2 e 3),
  -- ninguém aparece. Sem preferência: quem tem menos atendimentos no dia vem
  -- primeiro; empate pela ordem do barbeiro (determinístico).
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
          -- código repetido: o loop tenta de novo com outro código
          null;
        when exclusion_violation then
          -- Outro cliente pegou este barbeiro neste instante. Sai do loop interno
          -- e tenta o próximo barbeiro livre (sem preferência), se houver.
          exit;
      end;
    end loop;
  end loop;

  if v_achou_livre then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = 'URB07';
  end if;
  raise exception 'Horário indisponível. Escolha outro.' using errcode = 'URB05';
end;
$$;
revoke execute on function public.criar_agendamento(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento(text, text, timestamptz, text, text) to anon, authenticated;
