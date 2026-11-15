-- Seed da MENEZES BARBER's. Idempotente: pode rodar várias vezes
-- (on conflict atualiza em vez de duplicar).
-- O catálogo espelha src/data/barbearia.ts (mesmos slugs, nomes, preços, durações).
-- Se mudar um, mude o outro. Preço em centavos.
-- Roda no remoto com: npx supabase db push --linked --include-seed
--
-- ATENÇÃO: este banco já foi usado no demo da URBZ. O seed NÃO apaga nada de lá:
-- só desativa (ativo = false) os serviços e barbeiros que não são da Menezes,
-- porque agendamentos antigos apontam para eles.

-- Regras gerais.
insert into public.config
  (id, intervalo_slots_min, antecedencia_min_minutos, janela_max_dias, max_pendentes_por_telefone, expira_pendente_min,
   max_criacoes_por_minuto, max_criacoes_por_hora)
values
  (true, 30, 60, 30, 2, 120, 10, 30) -- TODO: confirmar com o dono (grade de 30 min, antecedência de 1 h, janela de 30 dias, limite de pendentes, expiração do pendente e tetos globais)
on conflict (id) do update set
  intervalo_slots_min = excluded.intervalo_slots_min,
  antecedencia_min_minutos = excluded.antecedencia_min_minutos,
  janela_max_dias = excluded.janela_max_dias,
  max_pendentes_por_telefone = excluded.max_pendentes_por_telefone,
  expira_pendente_min = excluded.expira_pendente_min,
  max_criacoes_por_minuto = excluded.max_criacoes_por_minuto,
  max_criacoes_por_hora = excluded.max_criacoes_por_hora;

-- Funcionamento (horário do AppBarber). Dia sem linha = fechado: domingo (0) sai.
delete from public.funcionamento where dia_semana = 0;
insert into public.funcionamento (dia_semana, abre, fecha, almoco_inicio, almoco_fim) values
  (1, '13:00', '20:00', null, null),
  (2, '09:00', '20:00', '12:00', '13:30'),
  (3, '09:00', '20:00', '12:00', '13:30'),
  (4, '09:00', '20:00', '12:00', '13:30'),
  (5, '09:00', '20:00', '12:00', '13:30'),
  (6, '09:00', '16:30', '12:00', '13:00')
on conflict (dia_semana) do update set
  abre = excluded.abre,
  fecha = excluded.fecha,
  almoco_inicio = excluded.almoco_inicio,
  almoco_fim = excluded.almoco_fim;

-- Serviços: todos avulsos (o cliente soma os que quiser). Preço e duração do AppBarber.
insert into public.servicos (slug, tipo, nome, itens, preco_centavos, duracao_min, ordem, ativo) values
  ('corte-masculino', 'avulso', 'Corte Masculino', '{}', 5500, 30, 1, true),
  ('cabelo-e-barba', 'avulso', 'Cabelo e Barba', '{}', 9500, 60, 2, true),
  ('barboterapia', 'avulso', 'Barboterapia', '{}', 5500, 30, 3, true),
  ('barboterapia-premium', 'avulso', 'Barboterapia Premium', '{}', 8500, 30, 4, true),
  ('barba-na-maquina', 'avulso', 'Barba na Máquina', '{}', 4000, 30, 5, true),
  ('limpeza-de-pele', 'avulso', 'Limpeza de Pele', '{}', 7990, 30, 6, true)
on conflict (slug) do update set
  tipo = excluded.tipo,
  nome = excluded.nome,
  itens = excluded.itens,
  preco_centavos = excluded.preco_centavos,
  duracao_min = excluded.duracao_min,
  ordem = excluded.ordem,
  ativo = excluded.ativo;

-- Sobras do demo anterior: saem do catálogo sem apagar o histórico.
update public.servicos set ativo = false
where slug not in ('corte-masculino', 'cabelo-e-barba', 'barboterapia', 'barboterapia-premium', 'barba-na-maquina', 'limpeza-de-pele');

-- Barbeiros (aba Profissionais do AppBarber). TODO: confirmar com o dono quem atende.
insert into public.barbeiros (slug, nome, especialidade, ordem, ativo) values
  ('alessandro', 'Alessandro', 'Barbeiro', 1, true),
  ('jhonathan', 'Jhonathan', 'Barbeiro', 2, true),
  ('jose', 'José', 'Barbeiro', 3, true),
  ('jose-bonadiman', 'José Bonadiman', 'Barbeiro', 4, true),
  ('lucas', 'Lucas', 'Barbeiro', 5, true)
on conflict (slug) do update set
  nome = excluded.nome,
  especialidade = excluded.especialidade,
  ordem = excluded.ordem,
  ativo = excluded.ativo;

update public.barbeiros set ativo = false
where slug not in ('alessandro', 'jhonathan', 'jose', 'jose-bonadiman', 'lucas');

-- Equipe: quem entra no /painel. Coloca na equipe os usuários do Auth com estes e-mails
-- (e-mail não é segredo). 'painel@urbz.teste' é o usuário de teste que já existe neste banco;
-- 'painel@menezes.teste' é o novo, se você criar. Usuário que não existe no Auth é ignorado:
-- crie em Authentication > Users e rode o seed de novo.
insert into public.equipe (user_id, nome)
select id, 'Equipe Menezes' from auth.users where email in ('painel@menezes.teste', 'painel@urbz.teste')
on conflict do nothing;

-- Aviso (não erro): se a equipe ficou vazia, o painel não terá ninguém com acesso.
do $$
begin
  if not exists (select 1 from public.equipe) then
    raise warning 'Equipe vazia: nenhum usuário do Auth com os e-mails acima. Crie um e rode o seed de novo.';
  end if;
end
$$;
