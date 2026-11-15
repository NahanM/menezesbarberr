-- Limite global de criações (S3), revisão do crítico:
--   1. Valores de PRODUÇÃO: 10 por minuto e 30 por hora (TODO: confirmar com o dono). Antes
--      subi o teto por minuto para 100 só para as suítes de teste caberem; isso afrouxava a
--      proteção real. Agora os testes é que se ajustam: o caminho de teste não conta no limite.
--   2. Linhas criadas por teste_criar_agendamento ficam marcadas (fora_do_limite) e NÃO entram
--      na contagem. Só essa função da equipe marca; o visitante não tem como. Assim os testes
--      de integração criam à vontade sem gastar a cota de quem usa o caminho público.
--   3. criar_agendamento lê os limites com "select into" e erra claro (URB19) se a linha da
--      config sumir, em vez de devolver zero linhas sem dizer por quê.
--   4. "Cancelado não conta" amarrado à expiração: a config passa a exigir
--      expira_pendente_min >= 60. Pendente expirado nasce cancelado depois de 60 min ou mais,
--      portanto sempre fora da janela de 1 h do limite; a expiração nunca "devolve" cota.

-- 1) Valores de produção
alter table public.config
  alter column max_criacoes_por_minuto set default 10,
  alter column max_criacoes_por_hora set default 30;
update public.config set max_criacoes_por_minuto = 10, max_criacoes_por_hora = 30;
comment on column public.config.max_criacoes_por_minuto is
  'Teto global de agendamentos criados (não cancelados) no último minuto. Anti-robô. TODO: confirmar com o dono.';
comment on column public.config.max_criacoes_por_hora is
  'Teto global de agendamentos criados (não cancelados) na última hora. Com a expiração de 2 h, limita os pendentes falsos simultâneos (no máximo ~2x este valor). TODO: confirmar com o dono.';

-- 4) Expiração >= janela do limite (60 min). O check antigo (>= 5) é trocado.
alter table public.config drop constraint config_expira_pendente_min_check;
alter table public.config
  add constraint config_expira_cobre_janela_do_limite check (expira_pendente_min >= 60);

-- 2) Marca das linhas de teste
alter table public.agendamentos
  add column fora_do_limite boolean not null default false;
comment on column public.agendamentos.fora_do_limite is
  'Verdadeiro só para linhas criadas por teste_criar_agendamento (equipe): não contam no limite global de criações.';

-- Troca das funções: o corpo interno ganha o parâmetro p_conta_no_limite.
drop function public.teste_criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz);
drop function public._criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz);

create function public._criar_agendamento(
  p_servicos text[],
  p_barbeiro text,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text,
  p_max_minuto integer,
  p_max_hora integer,
  p_agora timestamptz,
  p_conta_no_limite boolean
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
  v_criados_minuto integer;
  v_criados_hora integer;
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

  -- Limite GLOBAL de criações (S3): vale para todos os visitantes juntos, sem olhar telefone nem
  -- nome. O lock serializa a contagem e o insert: dois pedidos simultâneos não passam juntos
  -- do limite. A ordem dos locks é sempre a mesma (telefone, depois global): sem deadlock.
  -- Linha criada pelo caminho de teste (fora_do_limite) também não conta; só a função da equipe cria assim.
  -- Cancelado não conta: só a equipe cancela (e a expiração, que só age depois de 60 min ou mais, por causa do check na config, fora da
  -- janela de 1 h); então limpar spam no painel libera a cota, e um robô não escapa disso.
  -- p_agora é a hora de referência da contagem; a versão pública passa now().
  perform pg_advisory_xact_lock(hashtextextended('urbz:global', 0));

  select count(*) filter (where a.criado_em > p_agora - interval '1 minute')::integer,
         count(*)::integer
    into v_criados_minuto, v_criados_hora
  from public.agendamentos a
  where a.status <> 'cancelado'
    and not a.fora_do_limite
    and a.criado_em > p_agora - interval '1 hour';

  if v_criados_minuto >= p_max_minuto or v_criados_hora >= p_max_hora then
    -- Mensagem genérica de propósito: não diz qual janela estourou, nem os números.
    raise exception 'Muitos pedidos agora. Tente em alguns minutos.' using errcode = 'URB18';
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
          (servico_id, barbeiro_id, cliente_nome, cliente_telefone, periodo, fora_do_limite)
        values
          (v_ids[1], v_candidato.bid, v_nome, v_tel,
           tstzrange(p_inicio, p_inicio + make_interval(mins => v_duracao_total), '[)'),
           not p_conta_no_limite)
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
revoke execute on function public._criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz, boolean)
  from public, anon, authenticated;

-- Função pública: mesma assinatura e retornos. Os limites vêm da config com "select into".
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
#variable_conflict use_column
declare
  v_max_minuto integer;
  v_max_hora integer;
begin
  select c.max_criacoes_por_minuto, c.max_criacoes_por_hora
    into v_max_minuto, v_max_hora
  from public.config c;
  if not found then
    raise exception 'Configuração do agendamento ausente.' using errcode = 'URB19';
  end if;

  return query
    select r.codigo, r.barbeiro_nome, r.servico_nome, r.inicio, r.preco_total_centavos, r.duracao_total_min
    from public._criar_agendamento(
      p_servicos, p_barbeiro, p_inicio, p_nome, p_telefone, v_max_minuto, v_max_hora, now(), true
    ) r;
end;
$$;
revoke execute on function public.criar_agendamento(text[], text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento(text[], text, timestamptz, text, text) to anon, authenticated;

-- Função de teste (só equipe, só nome "Teste%"). p_conta_no_limite = false (padrão): a linha
-- criada NÃO conta no limite global. true: conta como uma criação normal (usado pelos testes do
-- próprio limite, que precisam de uma linha que conte).
create function public.teste_criar_agendamento(
  p_servicos text[],
  p_barbeiro text,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text,
  p_max_minuto integer,
  p_max_hora integer,
  p_agora timestamptz default now(),
  p_conta_no_limite boolean default false
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
#variable_conflict use_column
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_nome is null or p_nome not like 'Teste%'
     or p_max_minuto is null or p_max_minuto < 0
     or p_max_hora is null or p_max_hora < 0
     or p_agora is null or p_conta_no_limite is null then
    raise exception 'Informe nome com prefixo Teste, limites e a hora de referência.' using errcode = 'URB10';
  end if;

  return query
    select r.codigo, r.barbeiro_nome, r.servico_nome, r.inicio, r.preco_total_centavos, r.duracao_total_min
    from public._criar_agendamento(
      p_servicos, p_barbeiro, p_inicio, p_nome, p_telefone, p_max_minuto, p_max_hora, p_agora, p_conta_no_limite
    ) r;
end;
$$;
revoke execute on function public.teste_criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.teste_criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz, boolean)
  to authenticated;
