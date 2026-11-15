# MENEZES BARBER's: site + agendamento (demo)

Este arquivo define o projeto. Seu papel vem do prompt ou da definição de subagente que você recebeu; sem papel definido, você é o dev principal.

Objetivo: um demo funcional e bonito para apresentar ao dono da MENEZES BARBER's (Pato Branco/PR), com agendamento próprio no lugar do AppBarber.

Origem: este projeto nasceu do demo da URBZ Barber Block (`NahanM/URBZ`). Banco, regras de agendamento e painel vieram de lá sem mudança de estrutura. Alguns nomes internos ainda são da URBZ e NÃO devem ser renomeados sem necessidade: o token de cor `neon` (hoje amarelo), a curva `ease-urbz`, os códigos de erro `URBxx` e as chaves `urbz:` do banco e do navegador. Os arquivos em `prompts/` e `.claude/agents/` também vieram de lá e ainda citam a URBZ.

O dono do repositório está aprendendo. Outro agente vai ler seus commits para explicar o código a ele, então cada mudança precisa ser legível e justificada.

## Stack (decidida; para trocar, pergunte antes)

- Front: React + Vite + TypeScript, React Router, Tailwind CSS, Motion para animação, Lenis para scroll suave no desktop.
- Back: Supabase (Postgres + Auth). Regra de negócio fica no banco, em funções SQL chamadas por RPC.
- Testes: Vitest (funções puras e integração com Supabase) e Playwright (fluxos completos e capturas de tela).

## Identidade visual

- Fundo quase preto (#0B0B0D) e grafite (#2E2E36). Texto forte em off-white quente (#F5F1E8).
- Destaque: amarelo do logo (#F0B414, token `neon`). No arquivo do logo o tom medido é #F7B516; o dono pediu #F0B414.
- Dourado quente (#D8A868, token `dourado`) para preço e detalhe de luz.
- Títulos: Anton, caixa alta. Texto corrido: Inter.
- Copy real: "Uma nova experiência para uma antiga tradição."
- Cores, fontes e espaçamentos ficam centralizados como tokens em `src/styles/index.css`. Componentes usam só os tokens.

## Página inicial

- Topo em 3 camadas (fundo desfocado do salão, cadeira, bancada com navalha e tesoura). No computador as camadas seguem o mouse: fundo até 20 px para um lado, cadeira 30 px e bancada 42 px para o outro; vertical é metade. No celular sobem com a rolagem: 40, 80 e 140 px. Com `prefers-reduced-motion` nada se move.
- Os números do topo vêm de uma especificação fechada do dono do repositório. Não altere sem pedir. Dois já foram mudados com aviso: enquadramento no celular (84% em vez de 70%) e largura do texto entre 769 e 1023 px (420 em vez de 480).
- Seções: serviços (tabela de preços), o espaço, barbeiros, onde estamos, chamada final, rodapé.
- "O espaço" usa só fotos reais do salão. Nenhuma imagem de IA nessa seção.
- Proibido (cara de template): grade de cards iguais com ícone, gradiente roxo, glassmorphism, emoji, copy genérica.
- Animar só `transform` e `opacity`. Se uma animação não disparar, o conteúdo aparece mesmo assim.

## Dados da barbearia

Fonte: página da barbearia no AppBarber, lida em 14/11/2026. Tudo espelhado em `src/data/barbearia.ts` e `supabase/seed.sql` (o teste `tests/dados-menezes.test.ts` confere se batem).

| Serviço | Preço | Duração |
|---|---|---|
| Corte Masculino | a partir de R$ 55,00 | 30 min |
| Cabelo e Barba | a partir de R$ 95,00 | 60 min |
| Barboterapia | R$ 55,00 | 30 min |
| Barboterapia Premium | R$ 85,00 | 30 min |
| Barba na Máquina | R$ 40,00 | 30 min |
| Limpeza de Pele | R$ 79,90 | 30 min |

- Sem combo: o cliente soma os serviços que quiser (todos são `avulso` no banco). O código de combo continua pronto.
- Profissionais: Alessandro, Jhonathan, José, José Bonadiman, Lucas.
- Funcionamento: segunda 13:00 às 20:00; terça a sexta 09:00 às 12:00 e 13:30 às 20:00; sábado 09:00 às 12:00 e 13:00 às 16:30; domingo fechado.
- Endereço: Rua Itabira, 1166, Centro, Pato Branco - PR, 85501-047. WhatsApp (46) 99983-3026. Fixo (46) 3199-0441. Instagram @menezes_barbers.
- TODO confirmar com o dono: quais profissionais atendem, grade de 30 min, antecedência mínima de 1 h, janela de 30 dias, limite de 2 pendentes por telefone, e-mail de acesso ao painel.

Para o que não está nesta seção, use placeholder visível marcado `[EXEMPLO]`. Fato inventado sobre a barbearia queima o demo na frente do dono.

## Regras de agendamento (validadas no servidor)

1. Horário só dentro do funcionamento do dia, fora do intervalo de almoço e fora de bloqueios feitos no painel.
2. O serviço inteiro precisa caber: início + duração termina até o fechamento e até o início do almoço.
3. Nada no passado. Respeitar antecedência mínima e janela máxima.
4. Um barbeiro nunca tem dois atendimentos sobrepostos. Garanta no banco com exclusion constraint (extensão btree_gist) por barbeiro e intervalo de tempo, ignorando cancelados. Validação no front é só conforto visual.
5. "Sem preferência" de barbeiro: o servidor escolhe um barbeiro livre naquele horário.
6. Respeitar o limite de pendentes por telefone (anti-spam).
7. Datas gravadas em timestamptz. Todo cálculo de dia e toda exibição em America/Sao_Paulo.
8. Status: pendente → confirmado → concluído | cancelado | não compareceu. Pendente já bloqueia o horário.

## Segurança e dados pessoais

Acesso:
- RLS ligado em todas as tabelas.
- O cadastro público fica desligado no Supabase (o dono do repositório faz isso no painel do Supabase). Mesmo assim, estar logado não dá acesso a nada: quem usa o painel está na tabela `equipe` (user_id ligado a `auth.users`). Policies e funções do painel checam isso pela função `is_equipe()`, nunca só pelo papel `authenticated`.
- Na Fase 2, o seed coloca na `equipe` o usuário cujo e-mail está em `E2E_EMAIL` (copie o e-mail para o seed; e-mail não é segredo).
- Visitante anônimo só executa `horarios_disponiveis` (devolve horários livres e nenhum dado de cliente) e `criar_agendamento`. Nenhuma policy dá select, insert, update ou delete direto para anon.

Funções no banco:
- O Postgres libera EXECUTE de toda função nova para todo mundo. Em cada migration que cria função: `revoke execute ... from public, anon` e depois `grant` explícito só para quem deve chamar.
- `security definer` só quando a função precisar passar por cima do RLS, sempre com `set search_path = ''` e nomes qualificados (`public.agendamentos`).
- `criar_agendamento` valida tudo no servidor: nome com 2 a 60 caracteres, telefone só com dígitos (10 a 13), serviço e barbeiro existentes e ativos, além das regras de agendamento.

Front:
- Sem `dangerouslySetInnerHTML`. Link do WhatsApp montado com `encodeURIComponent`. Link externo com `rel="noopener noreferrer"`.

Segredos:
- O front usa só a chave pública (anon/publishable). Chave secreta (service_role/secret) e senha do banco nunca entram no repositório nem no `.env` do projeto.
- `.env` fora do git; `.env.example` versionado, só com os nomes das variáveis.

Organização:
- Migrations SQL versionadas em `supabase/migrations/`, uma por mudança.
- A pasta `estudo/` é pessoal do dono do repositório: fica fora da leitura e da edição de qualquer agente, exceto o professor.

Risco conhecido do demo: alguém pode lotar a agenda com pendentes falsos usando telefones diferentes. Não resolva agora; registre no relatório. Mitigação futura: captcha (Cloudflare Turnstile) e expiração automática de pendentes.

## Escopo do demo

**Landing `/`** (mobile first, o link vai circular por Instagram e WhatsApp): topo em camadas, serviços com botão "Agendar" que já pré-seleciona o serviço, o espaço, barbeiros, localização + horário + mapa ilustrativo, chamada final, rodapé com Instagram e WhatsApp.

**Agendar `/agendar`**: um combo, ou um ou mais serviços avulsos somados (duração e preço somados no servidor; combo não se mistura com avulso) → barbeiro (ou sem preferência) → data → horários livres → nome e WhatsApp → revisão → confirmar. Ao confirmar, grava como pendente e mostra um botão que abre o WhatsApp da barbearia (link wa.me com texto codificado) com esta mensagem:

```
Olá, pessoal da Menezes! Quero confirmar meu horário: {serviço} com {barbeiro}, {dia da semana} {dd/mm} às {hh:mm}. Nome: {nome}. Código: {código curto}.
```

**Painel `/painel`** (login Supabase Auth, e-mail e senha): agenda do dia em colunas por barbeiro, navegação por dia e semana, ações confirmar / cancelar / concluir / não compareceu, bloquear horário (folga ou compromisso), botão para chamar o cliente no WhatsApp.

Fora do demo: pagamento online, envio automático de WhatsApp, várias unidades.

## Fluxo de trabalho (modo guiado, padrão)

No modo autônomo, `prompts/orquestrador.md` substitui esta seção e a de Fases.

1. No início de cada fase, escreva um plano de 3 a 6 linhas e espere meu ok.
2. Implemente em incrementos pequenos.
3. Ao fechar um incremento, chame o subagente `critico`. Aplique o que concordar; para cada ponto rejeitado, diga em 1 linha por quê.
4. Chame o subagente `qa`. Corrija o código até os testes passarem.
5. Um commit por incremento, mensagem em português neste formato:

```
feat: agenda do painel em colunas por barbeiro

Por quê: o barbeiro precisa ver o dia inteiro de uma vez no celular.
Como: componente AgendaDia busca pela função listar_agenda e agrupa por barbeiro.
```

6. Ao fechar a fase: nas Fases 1, 3, 4 e 5, chame o subagente `visual`; nas Fases 2, 3 e 4, chame o `seguranca`. Cada BLOQUEANTE deles vira um incremento de correção.
7. Ao terminar, responda: o que foi feito (até 5 linhas), o que crítico, visual e segurança apontaram, resultado dos testes, próximo passo.

Faltou dado de negócio: use o fictício e siga. Pergunte só quando a decisão mudar a arquitetura.

## Fases

- Fase 0: setup (Vite, Tailwind com tokens, Router, Motion, Lenis, client do Supabase, Vitest, Playwright, pastas, README, `estudo/` no `.gitignore`).
- Fase 1: landing completa, já com o movimento da Direção de arte.
- Fase 2: banco (tabelas, constraint, RLS, funções RPC, seed).
- Fase 3: fluxo `/agendar`.
- Fase 4: painel.
- Fase 5: polimento (refino das animações, estados de carregamento e erro, acessibilidade, Lighthouse).

Eu peço "Execute a Fase N". Uma fase por vez.

## Critério de pronto (toda fase)

- Funciona em 360px e em desktop, sem rolagem horizontal.
- Texto com contraste AA; foco visível ao navegar pelo teclado.
- Toda tela com dados tem estado de carregamento, vazio e erro.
- `any` no TypeScript só com comentário justificando.
- Testes passando.

## Variáveis de ambiente

Nomes fixos, já usados no `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL`, `E2E_SENHA`.


