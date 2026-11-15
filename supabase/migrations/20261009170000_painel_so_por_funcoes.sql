-- Migration de correção (após revisão do crítico). Não edita as anteriores.
--
-- 1) Fim do update direto em agendamentos: a equipe só muda status pela função
--    mudar_status. Assim existe um único caminho para alterar um agendamento
--    (conferência de is_equipe + trigger de transição + retorno do registro).
--    Os testes já foram migrados para mudar_status.
-- 2) criar_bloqueio rejeita bloqueio que já terminou (p_fim <= now()): URB12.
-- 3) DECISÃO: o servidor NÃO impede marcar "concluido" ou "nao_compareceu" antes
--    do horário do atendimento. A trava de "só depois do início" fica na UI do
--    painel (esconder/desabilitar o botão); o banco só valida as transições
--    de estado, e o teste de integração do caminho completo precisa disso.

-- 1) Sem privilégio de update nem policy de update para a equipe em agendamentos.
drop policy "equipe atualiza agendamentos" on public.agendamentos;
revoke update (status) on public.agendamentos from authenticated;
revoke update on public.agendamentos from authenticated;

-- 2) criar_bloqueio com a regra nova (create or replace mantém os grants).
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
