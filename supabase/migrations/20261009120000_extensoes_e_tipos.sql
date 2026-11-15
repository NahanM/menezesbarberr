-- Migration 1 de 4: extensão e tipos.
--
-- btree_gist deixa o índice "gist" comparar igualdade (=) de colunas comuns,
-- como o id do barbeiro. Sem ela não dá para montar a regra
-- "um barbeiro nunca tem dois atendimentos sobrepostos" (migration 3).
-- No Supabase, extensões ficam no schema "extensions" para não poluir o "public".
create extension if not exists btree_gist with schema extensions;

-- Os cinco estados de um agendamento (CLAUDE.md, regra 8):
-- pendente -> confirmado -> concluido | cancelado | nao_compareceu
-- Enum garante que o banco recusa qualquer outro texto.
create type public.status_agendamento as enum (
  'pendente',
  'confirmado',
  'concluido',
  'cancelado',
  'nao_compareceu'
);
