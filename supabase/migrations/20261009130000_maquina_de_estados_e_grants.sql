-- Migration de correção (após revisão do crítico). Não edita as anteriores:
-- migration já aplicada não se reescreve, corrige-se com uma nova.

-- ---------------------------------------------------------------
-- 1) Máquina de estados do agendamento (CLAUDE.md, regra 8).
-- Só estas mudanças de status são permitidas:
--   pendente   -> confirmado | cancelado
--   confirmado -> concluido | cancelado | nao_compareceu
-- Concluído, cancelado e não compareceu são finais. Repetir o mesmo
-- status é permitido (não muda nada). O trigger roda só quando a coluna
-- status aparece no UPDATE.
-- ---------------------------------------------------------------
create function public.validar_transicao_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'pendente' and new.status in ('confirmado', 'cancelado'))
     or (old.status = 'confirmado' and new.status in ('concluido', 'cancelado', 'nao_compareceu'))
  then
    return new;
  end if;

  raise exception 'Transição de status inválida: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;
-- Função de trigger ninguém chama direto: tiramos de todo mundo.
revoke execute on function public.validar_transicao_status() from public, anon, authenticated;

create trigger agendamentos_valida_status
before update of status on public.agendamentos
for each row execute function public.validar_transicao_status();

-- ---------------------------------------------------------------
-- 2) Bloqueios: INSERT só nas colunas que o painel preenche.
-- Assim "criado_por" sempre vem do default auth.uid() e ninguém
-- consegue gravar o nome de outra pessoa.
-- ---------------------------------------------------------------
revoke insert on public.bloqueios from authenticated;
grant insert (barbeiro_id, periodo, motivo) on public.bloqueios to authenticated;

-- ---------------------------------------------------------------
-- 3) Funções internas não precisam ser chamáveis por quem está logado.
-- (O default da coluna e o trigger rodam sem checar EXECUTE do chamador
-- na inserção feita pela função security definer do próximo incremento.)
-- ---------------------------------------------------------------
revoke execute on function public.gerar_codigo_curto() from authenticated;
revoke execute on function public.atualizar_atualizado_em() from authenticated;
