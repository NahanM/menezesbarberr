-- Migration 3 de 4: equipe, bloqueios e agendamentos
-- (o que muda todo dia) + a regra anti-conflito de horário.

-- ---------------------------------------------------------------
-- equipe: quem pode usar o painel. Estar logado NÃO basta (CLAUDE.md):
-- o user_id precisa estar nesta tabela. "on delete cascade": se o usuário
-- for apagado do Auth, a linha some junto.
-- ---------------------------------------------------------------
create table public.equipe (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60)
);
comment on table public.equipe is 'Usuários do Auth autorizados a usar o painel.';

-- ---------------------------------------------------------------
-- bloqueios: folga ou compromisso. Horário bloqueado não aparece como livre.
-- barbeiro_id nulo = bloqueia a barbearia inteira (ex.: feriado).
-- periodo é um "tstzrange": um intervalo de tempo com fuso, numa coluna só.
-- ---------------------------------------------------------------
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  barbeiro_id uuid references public.barbeiros (id) on delete cascade,
  periodo tstzrange not null,
  motivo text not null default '' check (char_length(motivo) <= 200),
  -- Quem criou: preenchido sozinho com o usuário logado.
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  -- Intervalo "meio aberto" [início, fim): inclui o início e exclui o fim.
  -- Assim um bloqueio das 10h às 11h não colide com um que começa às 11h.
  check (
    not isempty(periodo)
    and not lower_inf(periodo) and not upper_inf(periodo)
    and lower_inc(periodo) and not upper_inc(periodo)
  )
);
comment on table public.bloqueios is 'Folgas e compromissos. barbeiro_id nulo = todos os barbeiros.';

-- ---------------------------------------------------------------
-- Gerador do código curto do agendamento (o cliente manda no WhatsApp).
-- 6 caracteres de um alfabeto SEM letras/números parecidos
-- (sem I, L, O, 0, 1), para ninguém errar ao ler ou digitar.
-- Colisão é rara; se acontecer, a restrição "unique" recusa e a função
-- que cria o agendamento (próximo incremento) tenta de novo.
-- ---------------------------------------------------------------
create function public.gerar_codigo_curto()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;
revoke execute on function public.gerar_codigo_curto() from public, anon;
grant execute on function public.gerar_codigo_curto() to authenticated;

-- ---------------------------------------------------------------
-- agendamentos
-- ---------------------------------------------------------------
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default public.gerar_codigo_curto()
    check (codigo ~ '^[A-HJKMNP-Z2-9]{6}$'),
  servico_id uuid not null references public.servicos (id),
  barbeiro_id uuid not null references public.barbeiros (id),
  cliente_nome text not null check (char_length(cliente_nome) between 2 and 60),
  -- Só dígitos, 10 a 13 (DDD + número, com ou sem DDI).
  cliente_telefone text not null check (cliente_telefone ~ '^[0-9]{10,13}$'),
  -- Início e fim do atendimento, em tstzrange (veja bloqueios).
  periodo tstzrange not null,
  status public.status_agendamento not null default 'pendente',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    not isempty(periodo)
    and not lower_inf(periodo) and not upper_inf(periodo)
    and lower_inc(periodo) and not upper_inc(periodo)
  ),
  -- A REGRA DE OURO (CLAUDE.md, regra 4): para o mesmo barbeiro (=),
  -- dois períodos não podem se sobrepor (&&). Cancelado é ignorado, então
  -- cancelar libera o horário. Pendente, confirmado, concluído e não
  -- compareceu ocupam. O próprio banco recusa o conflito, mesmo se duas
  -- pessoas tentarem no mesmo milissegundo.
  constraint agendamentos_sem_sobreposicao
    exclude using gist (barbeiro_id with =, periodo with &&)
    where (status <> 'cancelado')
);
comment on table public.agendamentos is 'Atendimentos marcados. A exclusion constraint impede dois ao mesmo tempo para o mesmo barbeiro.';

-- Índices: atalhos para o banco achar linhas sem ler a tabela inteira.
-- (A exclusion constraint já cria um índice por barbeiro + período.)
-- Agenda do dia/semana no painel: "todos os agendamentos neste período".
create index agendamentos_periodo_idx on public.agendamentos using gist (periodo);
-- Anti-spam: contar pendentes de um telefone.
create index agendamentos_telefone_status_idx on public.agendamentos (cliente_telefone, status);
-- Chaves estrangeiras merecem índice (apagar/atualizar serviço fica rápido).
create index agendamentos_servico_idx on public.agendamentos (servico_id);
create index bloqueios_periodo_idx on public.bloqueios using gist (periodo);
create index bloqueios_barbeiro_idx on public.bloqueios (barbeiro_id);

-- Trigger = função que o banco roda sozinho a cada UPDATE.
-- Esta mantém "atualizado_em" correto sem depender de quem faz o update.
create function public.atualizar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
revoke execute on function public.atualizar_atualizado_em() from public, anon;

create trigger agendamentos_atualizado_em
before update on public.agendamentos
for each row execute function public.atualizar_atualizado_em();
