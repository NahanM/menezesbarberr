-- Migration: funções do painel (só para a equipe logada).
--
--   listar_agenda(p_de, p_ate)          agendamentos do período (inclui cancelados)
--   listar_bloqueios(p_de, p_ate)       bloqueios do período
--   mudar_status(p_id, p_status)        confirma / cancela / conclui / não compareceu
--   criar_bloqueio(...)                 folga ou compromisso; avisa quantos agendamentos conflitam
--   remover_bloqueio(p_id)
--
-- Toda função: security definer, search_path vazio, e a PRIMEIRA linha confere
-- is_equipe(). Quem não é da equipe leva 42501. Só "authenticated" tem EXECUTE
-- (anon nunca), mas a checagem interna é a defesa de verdade: estar logado
-- não basta (CLAUDE.md).
--
-- ERROS (além dos URB01 a URB09 das RPCs públicas):
--   42501  não é da equipe
--   URB10  período inválido (datas ausentes, fim antes do início, ou mais de 31 dias)
--   URB11  agendamento não encontrado
--   URB12  bloqueio inválido (fim <= início, ou mais de 14 dias)
--   URB13  motivo inválido (até 120 caracteres)
--   URB14  barbeiro do bloqueio não encontrado
--   URB15  bloqueio não encontrado
--   23514  transição de status inválida (vem do trigger; mensagem em português)
--
-- DECISÕES:
--   * Não há listar_barbeiros(): o painel lê a tabela "barbeiros" direto, porque a
--     policy "equipe le barbeiros" já permite. Uma função a menos para manter.
--   * Dias são interpretados em America/Sao_Paulo: [p_de 00:00, p_ate+1 00:00).
--   * Escrita em bloqueios agora só pelas funções: revogamos o CRUD direto.
--     A escrita direta em agendamentos (update de status) CONTINUA, porque os testes
--     de integração existentes a usam; o trigger de transição vale nos dois caminhos.

-- ===============================================================
-- listar_agenda
-- ===============================================================
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

  -- No máximo 31 dias por chamada (p_ate - p_de = 30 já são 31 dias inclusive).
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 30 then
    raise exception 'Período inválido (máximo de 31 dias).' using errcode = 'URB10';
  end if;

  v_de := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';

  return query
    select a.id, a.codigo, a.status, lower(a.periodo), upper(a.periodo),
           a.barbeiro_id, b.nome, s.nome, s.tipo, a.cliente_nome, a.cliente_telefone
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.periodo && tstzrange(v_de, v_ate, '[)')
    order by lower(a.periodo), b.ordem, a.id;
end;
$$;
revoke execute on function public.listar_agenda(date, date) from public, anon, authenticated;
grant execute on function public.listar_agenda(date, date) to authenticated;

-- ===============================================================
-- listar_bloqueios (barbeiro_nome nulo = bloqueio da barbearia inteira)
-- ===============================================================
create function public.listar_bloqueios(p_de date, p_ate date)
returns table (
  id uuid,
  barbeiro_id uuid,
  barbeiro_nome text,
  inicio timestamptz,
  fim timestamptz,
  motivo text
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
    select k.id, k.barbeiro_id, b.nome, lower(k.periodo), upper(k.periodo), k.motivo
    from public.bloqueios k
    left join public.barbeiros b on b.id = k.barbeiro_id
    where k.periodo && tstzrange(v_de, v_ate, '[)')
    order by lower(k.periodo), k.id;
end;
$$;
revoke execute on function public.listar_bloqueios(date, date) from public, anon, authenticated;
grant execute on function public.listar_bloqueios(date, date) to authenticated;

-- ===============================================================
-- mudar_status: devolve o registro atualizado (mesmas colunas de listar_agenda).
-- A validação da transição é do trigger agendamentos_valida_status.
-- ===============================================================
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
           a.barbeiro_id, b.nome, s.nome, s.tipo, a.cliente_nome, a.cliente_telefone
    from public.agendamentos a
    join public.barbeiros b on b.id = a.barbeiro_id
    join public.servicos s on s.id = a.servico_id
    where a.id = v_id;
end;
$$;
revoke execute on function public.mudar_status(uuid, public.status_agendamento) from public, anon, authenticated;
grant execute on function public.mudar_status(uuid, public.status_agendamento) to authenticated;

-- ===============================================================
-- criar_bloqueio: NÃO cancela agendamentos. Só conta quantos ativos
-- (pendente ou confirmado) caem dentro do bloqueio, para o painel avisar.
-- p_barbeiro_id nulo = todos os barbeiros.
-- ===============================================================
create function public.criar_bloqueio(
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

  if p_inicio is null or p_fim is null or p_fim <= p_inicio
     or p_fim - p_inicio > interval '14 days' then
    raise exception 'Período do bloqueio inválido (o fim precisa ser depois do início, máximo de 14 dias).'
      using errcode = 'URB12';
  end if;

  -- Motivo: controle e espaços repetidos viram um espaço; até 120 caracteres.
  v_motivo := btrim(regexp_replace(coalesce(p_motivo, ''), '[[:cntrl:][:space:]]+', ' ', 'g'));
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

-- ===============================================================
-- remover_bloqueio
-- ===============================================================
create function public.remover_bloqueio(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  delete from public.bloqueios k where k.id = p_id returning k.id into v_id;
  if v_id is null then
    raise exception 'Bloqueio não encontrado.' using errcode = 'URB15';
  end if;
end;
$$;
revoke execute on function public.remover_bloqueio(uuid) from public, anon, authenticated;
grant execute on function public.remover_bloqueio(uuid) to authenticated;

-- ===============================================================
-- Bloqueios: a escrita agora passa só pelas funções acima.
-- (Remove os privilégios e as policies de escrita; a leitura direta fica.)
-- ===============================================================
drop policy "equipe cria bloqueios" on public.bloqueios;
drop policy "equipe atualiza bloqueios" on public.bloqueios;
drop policy "equipe apaga bloqueios" on public.bloqueios;
revoke insert, update, delete on public.bloqueios from authenticated;
