-- Migration: um agendamento pode ter VÁRIOS serviços avulsos somados.
-- (Decisão do dono: avulsos combináveis. Um combo continua sozinho.)
--
-- MODELO
--   * Nova tabela agendamento_servicos(agendamento_id, servico_id, preco_centavos,
--     duracao_min, ordem): uma linha por serviço do agendamento. Preço e duração são
--     COPIADOS do catálogo no momento da reserva (se o preço mudar depois, o histórico
--     não muda).
--   * agendamentos.servico_id CONTINUA, e guarda o serviço PRINCIPAL (o primeiro da
--     lista). Motivo: é a opção mais simples que não quebra nada: a chave estrangeira,
--     o índice, a tabela e os testes existentes seguem valendo; listar_agenda e
--     mudar_status só precisam trocar o NOME por "Corte + Sobrancelha".
--   * A duração do agendamento é a soma das durações, e já está gravada em
--     agendamentos.periodo (o fim do intervalo). Por isso o fim exibido no painel
--     sai certo sem conta nova.
--
-- FUNÇÕES
--   horarios_disponiveis(p_servicos text[], p_dia, p_barbeiro)
--   criar_agendamento(p_servicos text[], p_barbeiro, p_inicio, p_nome, p_telefone)
--     devolve também preco_total_centavos e duracao_total_min.
--   As assinaturas antigas de 1 slug (text) são REMOVIDAS (drop), não mantidas:
--   uma porta pública a menos para manter e testar. Quem chamava (front e testes)
--   foi atualizado no mesmo incremento.
--   Internas (sem grant, só as funções security definer chamam):
--     _resolver_servicos(text[])  valida a combinação e devolve os serviços em ordem
--     _nome_servicos(uuid)        nome combinado de um agendamento
--     _slots_livres(int, date, uuid)  agora recebe a DURAÇÃO TOTAL em minutos
--
-- COMBINAÇÃO VÁLIDA: 1 combo sozinho, OU de 1 a 5 avulsos distintos. Todos ativos.
--
-- ERROS (lista completa; os URB01 a URB09 seguem iguais):
--   URB01 serviço inexistente ou inativo | URB02 barbeiro inexistente ou inativo
--   URB03 nome inválido | URB04 telefone inválido | URB05 horário indisponível
--   URB06 limite de pendentes | URB07 horário acabou de ser ocupado
--   URB08 parâmetro obrigatório ausente (inclui lista de serviços vazia)
--   URB09 não foi possível gerar o código; tentar de novo
--   URB10 a URB15 painel (ver 20261009160000)
--   URB16 combinação de serviços inválida (combo misturado com outro serviço,
--         serviço repetido, mais de 5, ou item nulo)
--
-- Ordem dos serviços: a do array recebido (é a que aparece em "Corte + Sobrancelha").

-- ===============================================================
-- Tabela agendamento_servicos
-- ===============================================================
create table public.agendamento_servicos (
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  servico_id uuid not null references public.servicos (id),
  preco_centavos integer not null check (preco_centavos >= 0),
  duracao_min integer not null check (duracao_min > 0),
  ordem smallint not null check (ordem between 1 and 5),
  primary key (agendamento_id, servico_id),
  unique (agendamento_id, ordem)
);
comment on table public.agendamento_servicos is
  'Serviços de cada agendamento (preço e duração copiados na hora). Escrita só por criar_agendamento.';
create index agendamento_servicos_servico_idx on public.agendamento_servicos (servico_id);

-- RLS ligado; só a equipe lê; ninguém escreve direto (nem authenticated, nem anon).
alter table public.agendamento_servicos enable row level security;
revoke all on table public.agendamento_servicos from anon, authenticated;
grant select on public.agendamento_servicos to authenticated;
create policy "equipe le agendamento_servicos" on public.agendamento_servicos
  for select to authenticated using (public.is_equipe());

-- Agendamentos que já existiam: um serviço só, o próprio servico_id.
insert into public.agendamento_servicos (agendamento_id, servico_id, preco_centavos, duracao_min, ordem)
select a.id, a.servico_id, s.preco_centavos, s.duracao_min, 1
from public.agendamentos a
join public.servicos s on s.id = a.servico_id;

-- ===============================================================
-- _slots_livres: igual à anterior, mas recebe a duração total em minutos
-- (a soma dos serviços) em vez de um serviço só. Continua sendo a ÚNICA fonte
-- da lógica de disponibilidade.
-- ===============================================================
drop function public.horarios_disponiveis(text, date, text);
drop function public.criar_agendamento(text, text, timestamptz, text, text);
drop function public._slots_livres(uuid, date, uuid);

create function public._slots_livres(p_duracao_min integer, p_dia date, p_barbeiro_id uuid)
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
    select p_duracao_min as duracao_min where p_duracao_min > 0
  ),
  dia as (
    select f.abre, f.fecha, f.almoco_inicio, f.almoco_fim
    from public.funcionamento f
    where f.dia_semana = extract(dow from p_dia)::int
  ),
  hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as d
  ),
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
    where p_dia >= h.d and p_dia <= h.d + c.janela_max_dias
  ),
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
    and v.ini >= now() + make_interval(mins => (select antecedencia_min_minutos from public.config))
    and not exists (
      select 1 from public.agendamentos a
      where a.barbeiro_id = b.id
        and a.status <> 'cancelado'
        and a.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    )
    and not exists (
      select 1 from public.bloqueios k
      where (k.barbeiro_id is null or k.barbeiro_id = b.id)
        and k.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    );
$$;
revoke execute on function public._slots_livres(integer, date, uuid) from public, anon, authenticated;

-- ===============================================================
-- _resolver_servicos: valida a combinação e devolve os serviços NA ORDEM recebida.
-- ===============================================================
create function public._resolver_servicos(p_servicos text[])
returns table (
  r_id uuid,
  r_nome text,
  r_preco_centavos integer,
  r_duracao_min integer,
  r_ordem integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n integer;
  v_achados integer;
  v_combos integer;
begin
  v_n := coalesce(array_length(p_servicos, 1), 0);
  if v_n = 0 then
    raise exception 'Informe o serviço.' using errcode = 'URB08';
  end if;
  -- Mais de 5, item nulo ou repetido: combinação inválida.
  if v_n > 5
     or exists (select 1 from unnest(p_servicos) as x where x is null)
     or (select count(distinct x) from unnest(p_servicos) as x) <> v_n then
    raise exception 'Combinação de serviços inválida.' using errcode = 'URB16';
  end if;

  select count(*), count(*) filter (where s.tipo = 'combo')
    into v_achados, v_combos
  from unnest(p_servicos) as t(slug)
  join public.servicos s on s.slug = t.slug and s.ativo;

  if v_achados <> v_n then
    raise exception 'Serviço não encontrado.' using errcode = 'URB01';
  end if;
  -- Combo só vale sozinho.
  if v_combos > 0 and v_n > 1 then
    raise exception 'Combo não se mistura com outros serviços.' using errcode = 'URB16';
  end if;

  return query
    select s.id, s.nome, s.preco_centavos, s.duracao_min, t.ord::integer
    from unnest(p_servicos) with ordinality as t(slug, ord)
    join public.servicos s on s.slug = t.slug and s.ativo
    order by t.ord;
end;
$$;
revoke execute on function public._resolver_servicos(text[]) from public, anon, authenticated;

-- ===============================================================
-- _nome_servicos: "Corte + Sobrancelha". Cai no nome do serviço principal se
-- o agendamento não tiver linhas em agendamento_servicos (não deveria acontecer).
-- ===============================================================
create function public._nome_servicos(p_agendamento_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select string_agg(s.nome, ' + ' order by x.ordem)
       from public.agendamento_servicos x
       join public.servicos s on s.id = x.servico_id
      where x.agendamento_id = p_agendamento_id),
    (select s.nome
       from public.agendamentos a
       join public.servicos s on s.id = a.servico_id
      where a.id = p_agendamento_id)
  );
$$;
revoke execute on function public._nome_servicos(uuid) from public, anon, authenticated;

-- ===============================================================
-- horarios_disponiveis: duração = soma das durações.
-- ===============================================================
create function public.horarios_disponiveis(
  p_servicos text[],
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
  v_duracao integer;
  v_barbeiro_id uuid;
begin
  if p_servicos is null or p_dia is null then
    raise exception 'Informe o serviço e o dia.' using errcode = 'URB08';
  end if;

  select sum(r.r_duracao_min)::integer into v_duracao
  from public._resolver_servicos(p_servicos) r;

  if p_barbeiro is not null then
    select b.id into v_barbeiro_id
    from public.barbeiros b where b.slug = p_barbeiro and b.ativo;
    if v_barbeiro_id is null then
      raise exception 'Barbeiro não encontrado.' using errcode = 'URB02';
    end if;
  end if;

  return query
    select distinct l.inicio
    from public._slots_livres(v_duracao, p_dia, v_barbeiro_id) l
    order by 1;
end;
$$;
revoke execute on function public.horarios_disponiveis(text[], date, text) from public, anon, authenticated;
grant execute on function public.horarios_disponiveis(text[], date, text) to anon, authenticated;

-- ===============================================================
-- criar_agendamento: mesma lógica da versão anterior (nome, telefone canônico,
-- anti-spam, sem preferência, exclusion constraint), agora com vários serviços.
-- ===============================================================
create function public.criar_agendamento(
  p_servicos text[],
  p_barbeiro text,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text
)
returns table (
  codigo text,
  barbeiro_nome text,
  servico_nome text,
  inicio timestamptz,
  preco_total_centavos integer,
  duracao_total_min integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_nomes text[];
  v_precos integer[];
  v_duracoes integer[];
  v_nome_servico text;
  v_preco_total integer;
  v_duracao_total integer;
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
  v_agendamento_id uuid;
  v_barbeiro_nome text;
begin
  if p_servicos is null or p_inicio is null or p_nome is null or p_telefone is null then
    raise exception 'Preencha todos os campos.' using errcode = 'URB08';
  end if;

  -- Nome: 1) remove invisíveis; 2) controle e espaços repetidos viram um espaço;
  -- 3) tira as pontas; 4) mede 2 a 60; 5) exige 2 letras.
  v_nome := btrim(regexp_replace(
    regexp_replace(p_nome, '[​-‏‪-‮⁠-⁤﻿]', '', 'g'),
    '[[:cntrl:][:space:]]+', ' ', 'g'));
  if char_length(v_nome) < 2 or char_length(v_nome) > 60
     or char_length(regexp_replace(v_nome, '[^[:alpha:]]', '', 'g')) < 2 then
    raise exception 'O nome precisa ter de 2 a 60 caracteres, com pelo menos 2 letras.' using errcode = 'URB03';
  end if;

  -- Telefone: forma canônica (com 55).
  v_tel := regexp_replace(p_telefone, '[\s()+-]', '', 'g');
  if v_tel ~ '^[0-9]{10,11}$' then
    v_tel := '55' || v_tel;
  elsif v_tel !~ '^55[0-9]{10,11}$' then
    raise exception 'Telefone inválido. Use DDD + número.' using errcode = 'URB04';
  end if;

  -- Serviços: valida a combinação (URB01/URB08/URB16) e guarda tudo em arrays,
  -- na ordem recebida, para o insert dentro do loop não depender de nova consulta.
  select array_agg(r.r_id order by r.r_ordem),
         array_agg(r.r_nome order by r.r_ordem),
         array_agg(r.r_preco_centavos order by r.r_ordem),
         array_agg(r.r_duracao_min order by r.r_ordem),
         sum(r.r_preco_centavos)::integer,
         sum(r.r_duracao_min)::integer
    into v_ids, v_nomes, v_precos, v_duracoes, v_preco_total, v_duracao_total
  from public._resolver_servicos(p_servicos) r;
  v_nome_servico := array_to_string(v_nomes, ' + ');

  if p_barbeiro is not null then
    select b.id into v_barbeiro_id
    from public.barbeiros b where b.slug = p_barbeiro and b.ativo;
    if v_barbeiro_id is null then
      raise exception 'Barbeiro não encontrado.' using errcode = 'URB02';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('urbz:tel:' || v_tel, 0));

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

  for v_candidato in
    select l.barbeiro_id as bid, b.nome as bnome
    from public._slots_livres(v_duracao_total, v_dia, v_barbeiro_id) l
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

    for v_tentativa in 1..5 loop
      begin
        -- servico_id = o PRINCIPAL (primeiro da lista); o período já tem a duração somada.
        insert into public.agendamentos
          (servico_id, barbeiro_id, cliente_nome, cliente_telefone, periodo)
        values
          (v_ids[1], v_candidato.bid, v_nome, v_tel,
           tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracao_total), '[)'))
        returning public.agendamentos.id, public.agendamentos.codigo
          into v_agendamento_id, v_codigo;

        -- Mesmo bloco: se algo falhar aqui, o agendamento acima também é desfeito.
        insert into public.agendamento_servicos
          (agendamento_id, servico_id, preco_centavos, duracao_min, ordem)
        select v_agendamento_id, t.sid, t.preco, t.duracao, t.ord::smallint
        from unnest(v_ids, v_precos, v_duracoes) with ordinality as t(sid, preco, duracao, ord);

        v_barbeiro_nome := v_candidato.bnome;
        return query select v_codigo, v_barbeiro_nome, v_nome_servico, p_inicio,
                            v_preco_total, v_duracao_total;
        return;
      exception
        when unique_violation then
          if v_tentativa = 5 then
            v_codigo_esgotou := true;
          end if;
        when exclusion_violation then
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
revoke execute on function public.criar_agendamento(text[], text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento(text[], text, timestamptz, text, text) to anon, authenticated;

-- ===============================================================
-- listar_agenda e mudar_status: servico_nome vira o nome combinado.
-- Mesmas colunas de antes (create or replace mantém os grants; reafirmados).
-- O fim (coluna "fim") já é o da duração somada, pois sai de agendamentos.periodo.
-- ===============================================================
create or replace function public.listar_agenda(p_de date, p_ate date)
returns table (
  id uuid,
  codigo text,
  status public.status_agendamento,
  inicio timestamptz,
  fim timestamptz,
  barbeiro_id uuid,
  barbeiro_nome text,
  servico_nome text,
  servico_tipo text,
  cliente_nome text,
  cliente_telefone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_de timestamptz;
  v_ate timestamptz;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 30 then
    raise exception 'Período inválido (máximo de 31 dias).' using errcode = 'URB10';
  end if;

  v_de := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';

  return query
    select a.id, a.codigo, a.status, lower(a.periodo), upper(a.periodo),
           a.barbeiro_id, b.nome, public._nome_servicos(a.id), s.tipo,
           a.cliente_nome, a.cliente_telefone
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.periodo && tstzrange(v_de, v_ate, '[)')
    order by lower(a.periodo), b.ordem, a.id;
end;
$$;
revoke execute on function public.listar_agenda(date, date) from public, anon, authenticated;
grant execute on function public.listar_agenda(date, date) to authenticated;

create or replace function public.mudar_status(p_id uuid, p_status public.status_agendamento)
returns table (
  id uuid,
  codigo text,
  status public.status_agendamento,
  inicio timestamptz,
  fim timestamptz,
  barbeiro_id uuid,
  barbeiro_nome text,
  servico_nome text,
  servico_tipo text,
  cliente_nome text,
  cliente_telefone text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_id is null or p_status is null then
    raise exception 'Informe o agendamento e o novo status.' using errcode = 'URB10';
  end if;

  update public.agendamentos a set status = p_status where a.id = p_id returning a.id into v_id;
  if v_id is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'URB11';
  end if;

  return query
    select a.id, a.codigo, a.status, lower(a.periodo), upper(a.periodo),
           a.barbeiro_id, b.nome, public._nome_servicos(a.id), s.tipo,
           a.cliente_nome, a.cliente_telefone
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.id = v_id;
end;
$$;
revoke execute on function public.mudar_status(uuid, public.status_agendamento) from public, anon, authenticated;
grant execute on function public.mudar_status(uuid, public.status_agendamento) to authenticated;
