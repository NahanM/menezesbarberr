-- Migration 2 de 4: tabelas de catálogo e configuração
-- (o que a barbearia oferece e quando abre).

-- ---------------------------------------------------------------
-- config: UMA linha só, com as regras gerais de agendamento.
-- O truque: a chave primária é um boolean que só pode ser "true",
-- então o banco não deixa criar uma segunda linha.
-- ---------------------------------------------------------------
create table public.config (
  id boolean primary key default true check (id),
  -- Grade de horários: a cada quantos minutos começa um horário (ex.: 30).
  intervalo_slots_min integer not null check (intervalo_slots_min between 5 and 240),
  -- Antecedência mínima para marcar, em minutos (ex.: 60 = 1 hora antes).
  antecedencia_min_minutos integer not null check (antecedencia_min_minutos >= 0),
  -- Até quantos dias à frente dá para marcar.
  janela_max_dias integer not null check (janela_max_dias between 1 and 365),
  -- Anti-spam: máximo de agendamentos pendentes por telefone.
  max_pendentes_por_telefone integer not null check (max_pendentes_por_telefone >= 1),
  -- Todo cálculo de dia usa este fuso (CLAUDE.md, regra 7).
  fuso text not null default 'America/Sao_Paulo' check (fuso = 'America/Sao_Paulo')
);
comment on table public.config is 'Linha única com as regras gerais de agendamento.';

-- ---------------------------------------------------------------
-- funcionamento: um dia da semana por linha. Dia SEM linha = fechado.
-- ---------------------------------------------------------------
create table public.funcionamento (
  -- 0 = domingo ... 6 = sábado (mesma convenção do Date.getDay do JavaScript).
  dia_semana smallint primary key check (dia_semana between 0 and 6),
  abre time not null,
  fecha time not null,
  -- Almoço é opcional, mas é tudo ou nada: ou os dois horários, ou nenhum.
  almoco_inicio time,
  almoco_fim time,
  check (abre < fecha),
  check ((almoco_inicio is null) = (almoco_fim is null)),
  -- Se tem almoço, ele precisa estar dentro do expediente.
  check (
    almoco_inicio is null
    or (abre <= almoco_inicio and almoco_inicio < almoco_fim and almoco_fim <= fecha)
  )
);
comment on table public.funcionamento is 'Horário por dia da semana (0=domingo). Dia ausente = fechado.';

-- ---------------------------------------------------------------
-- servicos: combos e serviços avulsos na mesma tabela.
-- O "slug" é um nome curto sem acento (ex.: "cuidado-completo") que o site
-- usa para dizer qual serviço o cliente escolheu, sem expor o id.
-- ---------------------------------------------------------------
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tipo text not null check (tipo in ('combo', 'avulso')),
  nome text not null check (char_length(nome) between 2 and 60),
  -- O que o combo inclui (lista de textos). Vazio para avulso.
  itens text[] not null default '{}',
  -- Preço em centavos (inteiro): evita erro de arredondamento com decimal.
  preco_centavos integer not null check (preco_centavos >= 0),
  duracao_min integer not null check (duracao_min > 0),
  ativo boolean not null default true,
  ordem integer not null default 0
);
comment on table public.servicos is 'Combos e serviços avulsos. Preço em centavos.';

-- ---------------------------------------------------------------
-- barbeiros
-- ---------------------------------------------------------------
create table public.barbeiros (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null check (char_length(nome) between 2 and 60),
  especialidade text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0
);
comment on table public.barbeiros is 'Quem atende. "ativo = false" tira da agenda sem apagar o histórico.';
