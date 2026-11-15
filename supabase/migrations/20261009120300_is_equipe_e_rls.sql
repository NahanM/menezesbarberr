-- Migration 4 de 4: quem pode o quê (is_equipe + permissões + RLS).
--
-- Duas camadas protegem as tabelas:
--  1) GRANT/REVOKE: o privilégio da tabela em si ("pode mexer nesta tabela?").
--  2) RLS (row level security): quais LINHAS cada pessoa enxerga ou altera.
-- O Supabase, por padrão, dá tudo para anon e authenticated em "public".
-- Aqui tiramos tudo e devolvemos só o necessário.

-- ---------------------------------------------------------------
-- is_equipe(): "o usuário logado está na tabela equipe?"
-- security definer = roda com os poderes do dono da função, passando por cima
-- do RLS da própria tabela equipe (senão a checagem ficaria circular).
-- search_path vazio + nomes qualificados (public.equipe) impede que alguém
-- engane a função criando uma tabela com o mesmo nome em outro schema.
-- ---------------------------------------------------------------
create function public.is_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.equipe where user_id = auth.uid());
$$;
-- O Postgres libera EXECUTE de função nova para todo mundo; tiramos e
-- damos só a quem está logado. (Sem sessão, auth.uid() é nulo e dá false.)
revoke execute on function public.is_equipe() from public, anon;
grant execute on function public.is_equipe() to authenticated;

-- ---------------------------------------------------------------
-- Tirar tudo de anon e authenticated, nas tabelas que já existem...
-- ---------------------------------------------------------------
revoke all on table
  public.config, public.funcionamento, public.servicos, public.barbeiros,
  public.equipe, public.bloqueios, public.agendamentos
from anon, authenticated;

-- ...e nas que forem criadas no futuro por este usuário (postgres),
-- para uma tabela ou função nova não nascer aberta por esquecimento.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------
-- Devolver o mínimo para authenticated (que ainda precisará passar no RLS).
-- ---------------------------------------------------------------
grant select on
  public.config, public.funcionamento, public.servicos, public.barbeiros,
  public.equipe, public.bloqueios, public.agendamentos
to authenticated;

-- Agendamento: a equipe só muda o STATUS (privilégio por coluna).
-- Não há INSERT: criar agendamento só pela função criar_agendamento (próximo incremento).
-- Não há DELETE: cancelar é mudar o status, o histórico fica.
grant update (status) on public.agendamentos to authenticated;

-- Bloqueios: a equipe faz o CRUD completo.
grant insert, update, delete on public.bloqueios to authenticated;

-- ---------------------------------------------------------------
-- RLS ligado em TODAS as tabelas. Sem policy, ninguém vê nada;
-- as policies abaixo abrem só para a equipe.
-- Nenhuma policy para anon: visitante não lê nem escreve nada direto.
-- ---------------------------------------------------------------
alter table public.config enable row level security;
alter table public.funcionamento enable row level security;
alter table public.servicos enable row level security;
alter table public.barbeiros enable row level security;
alter table public.equipe enable row level security;
alter table public.bloqueios enable row level security;
alter table public.agendamentos enable row level security;

-- Leitura: equipe lê tudo.
create policy "equipe le config" on public.config
  for select to authenticated using (public.is_equipe());
create policy "equipe le funcionamento" on public.funcionamento
  for select to authenticated using (public.is_equipe());
create policy "equipe le servicos" on public.servicos
  for select to authenticated using (public.is_equipe());
create policy "equipe le barbeiros" on public.barbeiros
  for select to authenticated using (public.is_equipe());
create policy "equipe le equipe" on public.equipe
  for select to authenticated using (public.is_equipe());
create policy "equipe le bloqueios" on public.bloqueios
  for select to authenticated using (public.is_equipe());
create policy "equipe le agendamentos" on public.agendamentos
  for select to authenticated using (public.is_equipe());

-- Escrita da equipe: atualizar agendamento (só a coluna status, pelo GRANT)...
create policy "equipe atualiza agendamentos" on public.agendamentos
  for update to authenticated
  using (public.is_equipe())
  with check (public.is_equipe());

-- ...e CRUD de bloqueios.
create policy "equipe cria bloqueios" on public.bloqueios
  for insert to authenticated with check (public.is_equipe());
create policy "equipe atualiza bloqueios" on public.bloqueios
  for update to authenticated
  using (public.is_equipe())
  with check (public.is_equipe());
create policy "equipe apaga bloqueios" on public.bloqueios
  for delete to authenticated using (public.is_equipe());
