Modo autônomo. Você é o ORQUESTRADOR deste projeto: planeja, delega aos subagentes, decide e registra. Código de produção e testes ficam com os subagentes. Vou te deixar sozinho até o fim, sem ninguém para responder perguntas.

Leia o CLAUDE.md. Nesta execução, este prompt substitui as seções "Fluxo de trabalho" e "Fases" do CLAUDE.md. Todo o resto (stack, identidade, dados, regras, segurança, escopo, critério de pronto) vale integralmente.

## Equipe

- `dev`: implementa um incremento por vez.
- `critico`: revisa o incremento.
- `qa`: testa o incremento.
- `visual`: avalia as telas ao fechar as Fases 1, 3, 4 e 5.
- `seguranca`: audita e ataca a API ao fechar as Fases 2, 3 e 4.

Subagentes não chamam uns aos outros. Toda passagem de bastão é sua.

## Antes de começar

1. Leia o RELATORIO.md e o `git log`. Se o RELATORIO.md existir, você está retomando: continue da última etapa registrada.
2. Confira os pré-requisitos:
   - `.env` com URL e chave pública do Supabase, mais `E2E_EMAIL` e `E2E_SENHA` do usuário de teste do painel.
   - CLI do Supabase linkado: `npx supabase migration list` roda sem erro.
3. Faltou algum pré-requisito: execute só as Fases 0 e 1 e termine com o relatório listando o que falta.

## Fases

0. Setup (Vite, Tailwind com tokens, Router, Motion, Lenis, client do Supabase, Vitest, Playwright, pastas, README, `estudo/` no `.gitignore`).
1. Landing completa, já com o movimento da Direção de arte do CLAUDE.md.
2. Banco: tabelas, constraint, RLS, funções RPC, seed. Aplique migrations e seed no projeto remoto pelo CLI do Supabase (confira as opções com `npx supabase db push --help`).
3. Fluxo `/agendar`.
4. Painel.
5. Polimento: refino das animações, estados de carregamento e erro, acessibilidade.

## Loop de cada fase

1. Quebre a fase em 3 a 8 incrementos pequenos e registre a lista no RELATORIO.md.
2. Para cada incremento:
   a. Chame o `dev` com objetivo, arquivos prováveis e critério de aceite.
   b. Chame o `critico`. Se vier BLOQUEANTE ou IMPORTANTE, devolva ao `dev` só esses pontos.
   c. Chame o `qa`. Se algum teste falhar, devolva ao `dev` a reprodução.
   d. Repita b e c por até 3 rodadas. Com veredito aprovado e testes passando, faça o commit com a mensagem proposta pelo `dev`.
   e. Registre 1 linha no RELATORIO.md.
3. Portão da fase: chame `visual` (Fases 1, 3, 4 e 5) e `seguranca` (Fases 2, 3 e 4). Cada BLOQUEANTE vira um incremento de correção, com o mesmo loop. A fase só fecha com os dois sem BLOQUEANTE.
4. Um incremento que não passou em 3 rodadas encerra a execução inteira, porque construir em cima de base quebrada multiplica o erro. Registre o motivo e o estado no relatório e pare.

## Feedback externo

Outra IA testa o site e escreve em feedback-externo.md (fora do git). No início de cada fase e antes de cada portão, leia esse arquivo se existir. Itens com status "novo" contam como pontos do crítico: BLOQUEANTE e IMPORTANTE viram incremento de correção. Se um item contrariar o CLAUDE.md, o CLAUDE.md vence. Ao tratar um item, troque o status para "tratado" ou "recusado: motivo". Não apague nada desse arquivo.

## Decisões que seriam do dono do projeto

- Plano de cada fase: você aprova, conferindo contra o CLAUDE.md.
- Dúvida de arquitetura: escolha a opção mais simples que cumpre o CLAUDE.md e registre em DECISOES.md, em 3 linhas: decisão, alternativa descartada, motivo.
- Dado de negócio faltando: valor fictício com TODO, como manda o CLAUDE.md.

## Limites

- Comandos só dentro da pasta do projeto.
- Sem deploy, sem push para remoto, sem criar contas ou projetos externos.
- Stack do CLAUDE.md sem troca.
- Para poupar contexto: peça respostas curtas aos subagentes e leia arquivo grande só quando precisar.
- Ao chamar subagentes, não passe model nem effort: cada um usa o da própria definição.

## Final

Complete o RELATORIO.md com:
- Status por fase (feito, parcial ou parado) e quantos testes passam.
- Pontos do crítico, do visual e da segurança que ficaram para depois.
- Notas finais do `visual` e veredito final do `seguranca`.
- TODOs que dependem do dono da barbearia.
- Comandos para rodar o projeto localmente.
- Os 3 commits que eu deveria estudar primeiro, e por quê.

Então responda só: "Concluído. Veja RELATORIO.md." ou "Parado na Fase N. Veja RELATORIO.md."
