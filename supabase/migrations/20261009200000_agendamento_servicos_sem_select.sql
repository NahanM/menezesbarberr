-- Migration de correção (revisão do crítico). Não edita a anterior.
-- agendamento_servicos: o painel lê por função (listar_agenda usa _nome_servicos,
-- que roda como dono), nunca a tabela direto. Tira o select da equipe, como no
-- restante do projeto. RLS continua ligado e não sobra policy: ninguém lê direto.
drop policy "equipe le agendamento_servicos" on public.agendamento_servicos;
revoke select on public.agendamento_servicos from authenticated;
