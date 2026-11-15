-- Concluir e "não compareceu" só depois do início do atendimento.
-- Até aqui o painel escondia esses dois botões antes da hora, mas a regra só existia no front:
-- quem chamasse mudar_status direto conseguia concluir um atendimento de amanhã.
-- A regra de negócio fica no banco (CLAUDE.md): o trigger de transição passa a conferir a hora.
--
-- ERRO NOVO:
--   URB17  atendimento ainda não começou (concluir / não compareceu antes de lower(periodo))
--
-- Não mexe nas outras transições: pendente -> confirmado | cancelado e confirmado -> cancelado
-- continuam valendo a qualquer hora. A função é a mesma da migration 20261009130000, reescrita
-- com "create or replace" (o trigger agendamentos_valida_status continua apontando para ela).
create or replace function public.validar_transicao_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pendente' and new.status in ('confirmado', 'cancelado') then
    return new;
  end if;

  if old.status = 'confirmado' and new.status = 'cancelado' then
    return new;
  end if;

  if old.status = 'confirmado' and new.status in ('concluido', 'nao_compareceu') then
    -- Início do atendimento = começo do intervalo (periodo é um tstzrange [início, fim)).
    if now() < lower(old.periodo) then
      raise exception 'O atendimento ainda não começou. Só dá para concluir ou marcar falta depois do horário.'
        using errcode = 'URB17';
    end if;
    return new;
  end if;

  raise exception 'Transição de status inválida: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

-- Função de trigger ninguém chama direto: tiramos de todo mundo (create or replace manteria, mas explicitar não custa).
revoke execute on function public.validar_transicao_status() from public, anon, authenticated;
