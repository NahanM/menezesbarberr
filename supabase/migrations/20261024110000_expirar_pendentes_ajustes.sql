-- Ajustes da S2 (expiração de pendentes) após a revisão do crítico. Complementa 20261024100000.
--
--   1. teste_envelhecer_agendamento: só pendente (confirmado não é mais aceito).
--   2. _expirar_vencidos: trava as linhas com "for update skip locked", ordenadas por id, para
--      o cron e os pedidos do site não ficarem esperando um pelo outro (deadlock). Ganha o
--      parâmetro p_id, usado por mudar_status.
--   3. mudar_status: se o pendente já venceu, ele é expirado ali mesmo e a mudança pedida NÃO
--      é aplicada. A linha devolvida vem cancelada, com expirado_em preenchido, e o painel
--      avisa "esse pedido expirou". Por que não levantar um erro: um erro desfaria (rollback)
--      o próprio cancelamento por expiração, e o pendente continuaria "pendente" até o cron.
--      Pedir "cancelado" para um vencido não é conflito: o resultado é o mesmo.
--   4. criar_bloqueio (contagem de conflitos) e a ordenação do "sem preferência" em
--      criar_agendamento (contagem de carga do dia) ignoram pendente vencido.

-- ---------------------------------------------------------------
-- 1) Função de teste: só pendente.
-- ---------------------------------------------------------------
create or replace function public.teste_envelhecer_agendamento(p_codigo text, p_minutos integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_codigo is null or p_minutos is null or p_minutos not between 1 and 1440 then
    raise exception 'Informe o código e os minutos (1 a 1440).' using errcode = 'URB10';
  end if;

  update public.agendamentos a
     set criado_em = a.criado_em - make_interval(mins => p_minutos)
   where a.codigo = p_codigo
     and a.status = 'pendente'
     and a.cliente_nome like 'Teste%';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.teste_envelhecer_agendamento(text, integer) from public, anon, authenticated;
grant execute on function public.teste_envelhecer_agendamento(text, integer) to authenticated;

-- ---------------------------------------------------------------
-- 2) _expirar_vencidos com skip locked e p_id opcional.
-- Linha travada por outra transação (o cron, outro pedido) é pulada: quem a travou cuida dela.
-- A ordem por id é a mesma em todo lugar, o que também evita deadlock entre dois que travam várias.
-- ---------------------------------------------------------------
drop function public._expirar_vencidos(uuid, tstzrange);

create function public._expirar_vencidos(p_barbeiro_id uuid, p_periodo tstzrange, p_id uuid default null)
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

  with vencidos as (
    select a.id
    from public.agendamentos a
    where a.status = 'pendente'
      and a.criado_em + make_interval(mins => v_prazo) <= now()
      and (p_id is null or a.id = p_id)
      and (p_barbeiro_id is null or a.barbeiro_id = p_barbeiro_id)
      and (p_periodo is null or a.periodo && p_periodo)
    order by a.id
    for update skip locked
  )
  update public.agendamentos a
     set status = 'cancelado', expirado_em = now()
    from vencidos v
   where a.id = v.id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public._expirar_vencidos(uuid, tstzrange, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3) mudar_status devolve expirado_em e expira o próprio id se estiver vencido.
-- Coluna nova no retorno: apagar e recriar.
-- ---------------------------------------------------------------
drop function public.mudar_status(uuid, public.status_agendamento);

create function public.mudar_status(p_id uuid, p_status public.status_agendamento)
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

  -- Pendente vencido: expira agora e NÃO aplica o status pedido (veja o cabeçalho).
  if public._expirar_vencidos(null, null, p_id) > 0 then
    v_id := p_id;
  else
    update public.agendamentos a set status = p_status where a.id = p_id returning a.id into v_id;
  end if;
  if v_id is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'URB11';
  end if;

  return query
    select a.id, a.codigo, a.status, lower(a.periodo), upper(a.periodo),
           a.barbeiro_id, b.nome, public._nome_servicos(a.id), s.tipo,
           a.cliente_nome, a.cliente_telefone, a.expirado_em
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.id = v_id;
end;
$$;
revoke execute on function public.mudar_status(uuid, public.status_agendamento) from public, anon, authenticated;
grant execute on function public.mudar_status(uuid, public.status_agendamento) to authenticated;

-- ---------------------------------------------------------------
-- 4a) criar_bloqueio: conflitos não contam pendente vencido.
-- Corpo igual ao de 20261009180000, mudando só a contagem.
-- ---------------------------------------------------------------
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
  v_expira_min integer;
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
    regexp_replace(coalesce(p_motivo, ''), '[​-‏‪-‮⁠-⁤﻿]', '', 'g'),
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

  select c.expira_pendente_min into v_expira_min from public.config c;
  select count(*)::int into v_conflitos
  from public.agendamentos a
  where a.status in ('pendente', 'confirmado')
    -- Pendente vencido não é conflito: já não vale nada, só ainda não foi cancelado.
    and not (a.status = 'pendente' and a.criado_em + make_interval(mins => v_expira_min) <= now())
    and a.periodo && v_periodo
    and (p_barbeiro_id is null or a.barbeiro_id = p_barbeiro_id);

  return query select v_id, v_conflitos;
end;
$$;
revoke execute on function public.criar_bloqueio(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.criar_bloqueio(uuid, timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------
-- 4b) criar_agendamento: a carga do dia (ordenação do "sem preferência") ignora pendente vencido.
-- Corpo igual ao de 20261024100000, mudando só o count(*) do order by.
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
          -- Pendente vencido não pesa na carga do dia.
          and not (a.status = 'pendente' and a.criado_em + make_interval(mins => v_expira_min) <= now())
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
