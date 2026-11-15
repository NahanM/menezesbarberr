-- Pendente que ninguém confirma expira sozinho (auditoria de segurança, S2).
--
-- Problema: o limite de pendentes por telefone (URB06) não impede que telefones diferentes
-- lotem a agenda com pendentes falsos, e um pendente esquecido bloqueia o horário para sempre.
--
-- Decisão: o pendente vencido VIRA `cancelado` (não existe status novo). A exclusion constraint
-- só ignora cancelados, então filtrar o vencido apenas na leitura não bastaria: o horário
-- apareceria livre e o insert daria exclusion_violation. Virando cancelado, o slot é liberado de
-- verdade e a lista de status do CLAUDE.md continua a mesma. A coluna `expirado_em` marca o
-- motivo, e o painel mostra "Expirado" em vez de "Cancelado".
--
-- Peças:
--   1. config.expira_pendente_min (prazo, contado a partir de criado_em) e agendamentos.expirado_em.
--   2. _expirar_vencidos(barbeiro, período): faz a transição. Interna, ninguém chama pela API.
--   3. expirar_pendentes(): expira todos. Só o pg_cron (dono do banco) executa.
--   4. pg_cron a cada 5 min.
--   5. Expiração preguiçosa (sem depender do cron): criar_agendamento expira os vencidos do
--      barbeiro e período pedidos antes do insert. _slots_livres (usada por horarios_disponiveis,
--      que é só leitura) e a contagem do URB06 passam a ignorar pendente vencido.
--   6. listar_agenda devolve expirado_em.
-- A transição pendente -> cancelado passa pelo trigger validar_transicao_status, como qualquer outra.

-- ---------------------------------------------------------------
-- 1) Prazo e marca do motivo
-- ---------------------------------------------------------------
alter table public.config
  add column expira_pendente_min integer not null default 120 check (expira_pendente_min >= 5);
comment on column public.config.expira_pendente_min is
  'Minutos (a partir de criado_em) até um agendamento pendente não confirmado expirar. TODO: confirmar com o dono.';

alter table public.agendamentos
  add column expirado_em timestamptz,
  -- Só cancelado pode ter sido expirado.
  add constraint agendamentos_expirado_so_cancelado check (expirado_em is null or status = 'cancelado');
comment on column public.agendamentos.expirado_em is
  'Quando o pendente venceu e foi cancelado automaticamente. Nulo = cancelamento manual (ou nunca cancelado).';

-- ---------------------------------------------------------------
-- 2) A transição. Interna: criar_agendamento e expirar_pendentes chamam; ninguém mais.
-- p_barbeiro_id nulo = todos os barbeiros; p_periodo nulo = qualquer horário.
-- ---------------------------------------------------------------
create function public._expirar_vencidos(p_barbeiro_id uuid, p_periodo tstzrange)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prazo integer;
  v_n integer;
begin
  select c.expira_pendente_min into v_prazo from public.config c;

  update public.agendamentos a
     set status = 'cancelado', expirado_em = now()
   where a.status = 'pendente'
     and a.criado_em + make_interval(mins => v_prazo) <= now()
     and (p_barbeiro_id is null or a.barbeiro_id = p_barbeiro_id)
     and (p_periodo is null or a.periodo && p_periodo);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public._expirar_vencidos(uuid, tstzrange) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3) Expira todos os vencidos. Sem grant: quem executa é o pg_cron (roda como dono do banco,
-- que não precisa de grant). Nem anon nem authenticated chamam pela API.
-- ---------------------------------------------------------------
create function public.expirar_pendentes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._expirar_vencidos(null, null);
end;
$$;
revoke execute on function public.expirar_pendentes() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 4) pg_cron a cada 5 minutos. cron.schedule com o mesmo nome atualiza o job em vez de duplicar,
-- então rodar de novo é seguro.
-- ---------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'urbz-expirar-pendentes',
  '*/5 * * * *',
  $cron$select public.expirar_pendentes()$cron$
);

-- ---------------------------------------------------------------
-- 5a) _slots_livres: pendente vencido não ocupa horário.
-- Igual à versão de 20261009190000, mudando só o primeiro "not exists" (agendamentos).
-- ---------------------------------------------------------------
create or replace function public._slots_livres(p_duracao_min integer, p_dia date, p_barbeiro_id uuid)
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
        -- Pendente vencido (criado há mais que o prazo) já não ocupa: o cron ou o próximo agendamento o cancela.
        and not (
          a.status = 'pendente'
          and a.criado_em + make_interval(mins => (select c.expira_pendente_min from public.config c)) <= now()
        )
        and a.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    )
    and not exists (
      select 1 from public.bloqueios k
      where (k.barbeiro_id is null or k.barbeiro_id = b.id)
        and k.periodo && tstzrange(v.ini, v.ini + make_interval(mins => v.duracao_min), '[)')
    );
$$;
revoke execute on function public._slots_livres(integer, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 5b) criar_agendamento: expira os vencidos do barbeiro e do período pedidos antes de inserir,
-- e a contagem do URB06 ignora pendente vencido. Resto igual à versão de 20261023100000
-- (mesma assinatura, retornos e códigos de erro; os grants são reafirmados no fim).
-- ---------------------------------------------------------------
create or replace function public.criar_agendamento(
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
  v_expira_min integer;
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

  -- Telefone: só o FORMATO é checado aqui; forma canônica (com 55).
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

  v_dia := (p_inicio at time zone 'America/Sao_Paulo')::date;
  v_dia_ini := v_dia::timestamp at time zone 'America/Sao_Paulo';

  -- Horário (nada aqui depende do telefone): _slots_livres já aplica funcionamento,
  -- almoço, bloqueios, passado, antecedência, janela, "o serviço inteiro cabe" e
  -- conflito com outros atendimentos. Sem nenhum slot nesse início: URB05.
  if not exists (
    select 1
    from public._slots_livres(v_duracao_total, v_dia, v_barbeiro_id) l
    where l.inicio = p_inicio
  ) then
    raise exception 'Horário indisponível. Escolha outro.' using errcode = 'URB05';
  end if;

  -- Anti-spam por telefone: só agora, com o pedido já válido. O lock serializa
  -- pedidos do mesmo telefone entre a contagem e o insert.
  perform pg_advisory_xact_lock(hashtextextended('urbz:tel:' || v_tel, 0));

  select c.max_pendentes_por_telefone, c.expira_pendente_min
    into v_max_pendentes, v_expira_min
  from public.config c;
  -- Pendente vencido não conta: ele já não vale nada, só ainda não foi cancelado.
  if (
    select count(*) from public.agendamentos a
    where a.cliente_telefone = v_tel
      and a.status = 'pendente'
      and upper(a.periodo) > now()
      and a.criado_em + make_interval(mins => v_expira_min) > now()
  ) >= v_max_pendentes then
    raise exception 'Você já tem agendamentos pendentes demais. Confirme ou cancele algum antes de marcar outro.'
      using errcode = 'URB06';
  end if;

  -- Expiração preguiçosa: cancela os pendentes vencidos que ainda ocupam este barbeiro neste
  -- período (sem preferência: todos os barbeiros). Sem isso, o insert abaixo bateria na exclusion
  -- constraint num horário que _slots_livres já mostrou como livre. Não depende do cron.
  perform public._expirar_vencidos(
    v_barbeiro_id,
    tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracao_total), '[)')
  );

  -- Escolha do barbeiro (sem preferência: o menos ocupado no dia) e insert.
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
  -- Alguém ocupou o horário entre a checagem e a escolha do barbeiro.
  raise exception 'Horário indisponível. Escolha outro.' using errcode = 'URB05';
end;
$$;
revoke execute on function public.criar_agendamento(text[], text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento(text[], text, timestamptz, text, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 6) listar_agenda devolve expirado_em (o painel mostra "Expirado" em vez de "Cancelado").
-- Coluna nova no retorno: é preciso apagar e recriar a função. Corpo igual ao de 20261009190000.
-- mudar_status não muda: seu retorno não precisa da coluna.
-- ---------------------------------------------------------------
drop function public.listar_agenda(date, date);

create function public.listar_agenda(p_de date, p_ate date)
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
  cliente_telefone text,
  expirado_em timestamptz
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
           a.cliente_nome, a.cliente_telefone, a.expirado_em
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.periodo && tstzrange(v_de, v_ate, '[)')
    order by lower(a.periodo), b.ordem, a.id;
end;
$$;
revoke execute on function public.listar_agenda(date, date) from public, anon, authenticated;
grant execute on function public.listar_agenda(date, date) to authenticated;
