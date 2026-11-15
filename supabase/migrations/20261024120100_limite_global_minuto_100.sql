-- Ajusta o teto por minuto do limite global (20261024120000): de 60 para 100.
--
-- Por quê: medi uma execução completa das suítes de integração e segurança rodando juntas
-- (npm test + npm run test:seguranca): ~64 criações reais, 58 delas dentro de um mesmo minuto,
-- porque os arquivos de teste rodam em paralelo e todos criam no início. Um teto de 60 deixava
-- 2 de folga; qualquer teste novo derrubaria a suíte. Com 100 sobra folga.
--
-- Isso não afrouxa a proteção que importa: o teto por hora (120) segue igual e é ele quem limita
-- um robô (no máximo 120 criações por hora, ~240 pendentes falsos ao mesmo tempo com a expiração
-- de 2 h). O teto por minuto só corta rajadas, e um sábado inteiro cabe em ~60 agendamentos.
alter table public.config alter column max_criacoes_por_minuto set default 100;
update public.config set max_criacoes_por_minuto = 100;
