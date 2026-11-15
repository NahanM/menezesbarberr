# Relatório da execução autônoma

Pré-requisitos (08/10/2026): `.env` com as 4 variáveis ✔ · `npx supabase migration list` roda sem erro (nenhuma migration remota) ✔. Execução completa (Fases 0 a 5).

## Fase 0: setup

Incrementos:
1. Projeto Vite + React + TS, React Router com rotas `/`, `/agendar`, `/painel` (placeholders), Tailwind com tokens (cores, fontes, espaçamentos), fontes Bebas Neue/Anton + Barlow, estrutura de pastas.
2. Motion + Lenis (só desktop e sem reduced-motion), client do Supabase com chave pública, `.env.example`.
3. Vitest + Playwright configurados com um teste de fumaça cada; README com versões instaladas e comandos.

Registro:
- 0.1 ✔ scaffold Vite 8 + React 19 + TS + Router + Tailwind 4 (tokens em `@theme`, neon #DFFE04 lido do logo). Crítico: 3 IMPORTANTES corrigidos em 1 rodada. QA: lint/typecheck/build (frameworks de teste entram no 0.3). Processo: seção "Feedback externo" adicionada ao orquestrador.
- 0.2 ✔ Motion 14, Lenis 1.3 (só desktop, sem reduced-motion), client Supabase com chave pública, `.env.example`. Crítico aprovado com ajustes; pendência levada à Fase 1: tratar `#hash` de âncoras no RolagemSuave e carregar Agendar/Painel com `lazy` para a landing não depender do Supabase.
- 0.3 ✔ Vitest 5 + Playwright (celular 360x800 e desktop 1440x900, build+preview) + README. Crítico: 3 IMPORTANTES corrigidos (outputDir, .env no Playwright, prefixos do loadEnv). QA: 2 Vitest + 10 E2E passando.

**Fase 0: feita.** (sem portão de visual/segurança nesta fase)

## Fase 1: landing

feedback-externo.md: não existe no início da fase.

Incrementos:
1. Fotos e base: script que recorta fotos P&B dos posts em `referencias/` para `public/assets/fotos/` (webp); dados da barbearia em `src/data/` (combos reais, resto fictício com TODO); primitivos gráficos (listras, palavra vazada, seta, linha neon, revelação diagonal com garantia de visibilidade); header/rodapé; `lazy` em Agendar/Painel; âncoras `#hash`.
2. Hero (título gigante por máscara, foto com parallax, "BARBER BLOCK" vazado vertical em sentido oposto) + faixa de listras + marquee que acelera e inverte com o scroll.
3. Combos em sticky empilhando como posts, preço em etiqueta neon carimbada, botão "Agendar" com `/agendar?combo=`.
4. "Você cuida do carro. Cuida do tênis. E o visual?" frase a frase com foto + serviços avulsos + barbeiros.
5. Galeria + depoimentos `[EXEMPLO]` + localização/horário/mapa + CTA final "FAZ O SEU CORTE." + rodapé com Instagram e WhatsApp.
6. Portão: visual.

Registro:
- 1.1 ✔ base da landing: 12 fotos P&B recortadas dos posts (script sharp), dados tipados com TODOs, primitivos gráficos, header/rodapé, rotas lazy, #hash. Crítico: rede de segurança no reveal corrigida (1 rodada). QA: 23 Vitest + 22 E2E.
- 1.2 ✔ hero (título por máscara, parallax, BARBER BLOCK vazado em sentido oposto) + faixa de listras + marquee por velocidade do scroll. Crítico: foto escurecida no celular e palavra vazada corrigidas (1 rodada; achado bug do `.texto-vazado`). QA: 30 Vitest + 34 E2E.
- 1.3 ✔ combos como posts sticky empilhados, carimbo neon de preço, link `/agendar?combo=`. Crítico: nome acessível, folga em 360x640 e contraste do post 03 corrigidos (1 rodada). QA: 30 Vitest + 44 E2E.
- 1.4 ✔ sequência "Você cuida do carro" presa com scroll, serviços em tabela de pôster, barbeiros em linhas com `[EXEMPLO]`. Crítico: garantia de visibilidade da sequência e contraste do `[EXEMPLO]` no foco corrigidos (1 rodada). QA: 30 Vitest + 58 E2E.
- 1.5 ✔ galeria em mural (scroll-snap no celular), depoimentos `[EXEMPLO]`, local com horário e mapa SVG ilustrativo, CTA "FAZ O SEU CORTE." em largura total. Crítico: BLOQUEANTE de largura do CTA (768–1200px) corrigido, horário marcado `[EXEMPLO]`, galeria focável (1 rodada). QA: 30 Vitest + 72 E2E. Nota: links de Maps e WhatsApp apontam para dados fictícios até o dono confirmar.
- 1.6 ✔ correções do portão visual (preço nowrap, contador 01/03 na sequência, CTA do combo visível no desktop, grão estático nas fotos, faixa 100%, barbeiros alternados, CTA sem recuo). Crítico: frase da sequência em 360x560 e grão duplicado corrigidos. O dev travou no fim (watchdog); conferi o diff e rodei a suíte eu mesmo: 30 Vitest + 74 E2E.

**Portão Fase 1 — visual:** Fidelidade 8 | Sem cara de template 8 | Celular 7 — APROVADO COM AJUSTES, sem BLOQUEANTE. IMPORTANTES tratados no 1.6.
**Fase 1: feita.**

## Fase 2: banco

feedback-externo.md: não existe no início da fase.

Incrementos:
1. Esquema: extensão btree_gist, tabelas (`config`, `funcionamento`, `servicos`, `barbeiros`, `bloqueios`, `agendamentos`, `equipe`), enum de status, exclusion constraint por barbeiro e período (ignorando cancelados), RLS em tudo, `is_equipe()`, policies só para equipe, revoke/grant explícitos. Seed com catálogo idêntico a `src/data/barbearia.ts` e o usuário de `E2E_EMAIL` na equipe. Aplicado no remoto.
2. `horarios_disponiveis` e `criar_agendamento` (security definer, search_path vazio, validação completa, "sem preferência", limite de pendentes, fuso America/Sao_Paulo). Testes de integração com a chave pública.
3. Funções do painel: `listar_agenda`, `mudar_status`, `criar_bloqueio`/`remover_bloqueio`, todas checando `is_equipe()`. Testes com sessão da equipe e com anon.
4. Portão: segurança.

Registro:
- 2.1 ✔ esquema (7 tabelas, enum, exclusion constraint por barbeiro ignorando cancelado), RLS + `is_equipe()`, revokes/grants mínimos, seed idêntico ao catálogo do front e equipe pelo `E2E_EMAIL`; aplicado no remoto (5 migrations). Crítico: máquina de estados por trigger, signup desligado no config.toml, grants estreitos (1 rodada). QA: 50 Vitest (20 de integração no remoto) + 1 n/a (signUp desligado).
- 2.2 ✔ `horarios_disponiveis` e `criar_agendamento` (security definer, lógica única em `_slots_livres`, erros URB01–URB09, advisory lock por telefone, sem preferência por menor carga). Crítico: telefone canônico com 55, nome sem caracteres de controle, erro próprio para colisão de código (1 rodada). QA: 35+ casos de borda no remoto; 88 Vitest passando, 2 execuções seguidas. Achado: limpeza dos testes falhava inteira por causa de `concluido` (corrigido para um a um); ficaram agendamentos de teste antigos no remoto (pendentes e ~12 `concluido`, cliente "Teste QA") — limpeza em massa pela sessão da equipe foi bloqueada pelo classificador de permissões e não foi contornada. TODO do dono do repositório: apagar pelo painel do Supabase (`delete from public.agendamentos where cliente_nome = 'Teste QA'`).
- 2.3 ✔ funções do painel (`listar_agenda`, `listar_bloqueios`, `mudar_status`, `criar_bloqueio` com contagem de conflitos, `remover_bloqueio`), todas com `is_equipe()` na 1ª linha; escrita direta em `agendamentos` e `bloqueios` revogada (só via RPC). Crítico: sem bloqueante; bloqueio no passado recusado. QA: 105 Vitest (2 execuções), 17 do painel. Decisão: concluir/não compareceu antes do horário é travado só na UI do painel.
- 2.4 ✔ correção pós-portão: nome e motivo sem caracteres invisíveis/bidi, nome exige 2 letras; suíte de ataque em `npm run test:seguranca` (fora do `npm test`); README com configuração manual do Supabase.

**Portão Fase 2 — segurança:** SEGURO COM AJUSTES, sem BLOQUEANTE. 37 ataques, 36 barrados; o que "passa" é o cadastro público ligado no remoto (IMPORTANTE, configuração manual do dono: Authentication > Sign In / Providers > desligar "Allow new users to sign up"). `npm audit --omit=dev`: 0.
**Fase 2: feita.**

## Fase 3: fluxo /agendar

feedback-externo.md: não existe no início da fase.

Incrementos:
1. Camada de dados e funções puras: leitura de `?combo|servico|barbeiro`, datas em America/Sao_Paulo, mensagem do WhatsApp no formato exato do CLAUDE.md, mapa de erros URB → mensagens, chamadas às RPCs.
2. Telas: serviço/combo → barbeiro (ou sem preferência) → data → horários livres, com carregamento, vazio e erro; mobile first, identidade da URBZ.
3. Nome e WhatsApp → revisão → confirmar → sucesso com código e botão do WhatsApp; horário perdido (URB05/07) volta para os horários; E2E do fluxo completo.
4. Portão: visual e segurança.

Registro:
- 3.1 ✔ camada de dados do /agendar (pré-seleção por URL, datas em SP via Intl, mensagem do WhatsApp exata, mapa de erros URB → ação, API tipada sobre as RPCs). Crítico: telefone não apaga letras e TypeError não vira "sem rede" (1 rodada). QA: 158 Vitest (datas testadas em 4 fusos).
- 3.2 ✔ telas do /agendar até o horário (serviço → barbeiro → dia e hora; passo em `?passo=`, reducer, esqueleto de listras, vazio e erro). Interrompido pela queda da sessão; crítico e QA refeitos na retomada. Crítico: loop do Voltar e carregamento eterno sem dia aberto corrigidos, foco só na troca de passo, safe-area (1 rodada). QA: 187 Vitest + 120 E2E.
- 3.3 ✔ dados (máscara e validação), revisão com Editar, confirmação com roteamento por erro URB, sucesso em `/agendar/sucesso` com código em carimbo e botão "Confirmar no WhatsApp" (mensagem exata). Crítico: voltar preso no sucesso, perda do código no reload e invisíveis divergentes do servidor corrigidos (1 rodada). QA: 223 Vitest + 163 E2E (fluxo real landing → sucesso conferido em `listar_agenda` e cancelado).
- 3.4 ✔ correções pós-portão (cabeçalho enxuto no celular com ação visível acima da barra, número vazado grande, erro de validação distinto, sucesso com foto e copy, reserva expira em 2h no storage e no state). Crítico: validade do state e "Passo X de 05" para leitor de tela (1 rodada). Testes: 226 Vitest + 168 E2E.
- Suítes de portão versionadas: `tests/seguranca/agendar-front.test.ts` e `e2e/visual/captura-agendar.spec.ts`.

**Portão Fase 3 — visual:** Fidelidade 7,5 | Sem cara de template 7 | Celular 7 — APROVADO COM AJUSTES, sem BLOQUEANTE (IMPORTANTES tratados no 3.4).
**Portão Fase 3 — segurança:** SEGURO COM AJUSTES, sem BLOQUEANTE. 47/48 em `test:seguranca`; o que falha é o cadastro público ligado no remoto (manual do dono).

### Feedback externo (09/10) — tratado antes de fechar a Fase 3

6 itens novos (logo, fotos novas, enquadramento, rolagem da sequência e dos combos, desempenho das fotos). Incrementos:
- F1. Logo (só o símbolo, fundo transparente; SVG fiel se o recorte serrilhar) + fotos novas recortadas das grades por script sharp, WebP em 2–3 larguras com srcset, lazy fora da primeira tela; lista de fotos no relatório.
- F2. Enquadramento por foto (object-position celular/desktop) + rolagem curta: cada frase da sequência e cada combo com ~300–500px de roda.
- F1 ✔ logo vetorizado em SVG fiel (só o símbolo; TODO: pedir o original ao dono); fotos novas recortadas por `scripts/preparar-fotos.mjs` (originais em `scripts/fontes/`, 13 MB, versionados uma vez) em WebP de 2–3 larguras com srcset/sizes/width/height, lazy fora da 1ª tela, fetchpriority só no hero. Neon ajustado para #D4FD01 (medido no logo novo). Descartadas por defeito de IA: cliente na cadeira (capa "URRZ" deformada), tênis Nike na cadeira, barba com mão no queixo (dedos); carro só no recorte do farol (mão com dedos a mais). Crítico: 2 IMPORTANTES (originais no repo, foto com sobra de borda) resolvidos. QA: 236 Vitest + 179 E2E.

  | Foto final | Origem | Resolução | Onde |
  |---|---|---|---|
  | perfil-risco-no-cabelo | perfil-risco-no-cabelo.jpg, inteira | 1844x2304 | Hero |
  | retrato-barba-curta | retrato-barba-curta.jpg, inteira | 1914x2240 | Sequência "E o visual?" |
  | perfil-pescoco-tatuado | grade 9t9y, x0 y0 1376x1151 | 1370x1145 | Combo 02 e sucesso |
  | carro-farol-molhado | grade 9t9y, x0 y2185 336x867 | 330x861 | Sequência "Você cuida do carro" |
  | tenis-escova-branco | grade 9t9y, x699 y2057 677x1001 | 671x995 | Sequência "Cuida do tênis" e galeria |
  | retrato-jovem | grade m3d5, x15 y16 781x1317 | 775x1311 | Combo 01 |
  | retrato-serio | grade m3d5, x811 y16 781x1317 | 775x1311 | Galeria |
  | retrato-sorriso-barba | grade m3d5, x1608 y16 780x1317 | 774x1311 | Combo 03, galeria e sucesso |
  | tenis-escova-luva | grade m3d5, x2403 y16 782x649 | 776x643 | Galeria |
  | grupo-na-mesa (antiga) | MaisMais.png, print | 756x430 | Galeria |
- F2 ✔ rolagem curta: cada frase da sequência e cada combo troca em 400px de roda (medido em `e2e/rolagem.spec.ts`, celular e desktop, também 360x640 e 1440x1200); combos viraram uma tela presa com posts 2/3 subindo por translateY; foco por teclado rola até o post. Enquadramento por foto (`foco` celular/desktop). Crítico: foco do teclado nos posts e 360x640 (1 rodada). QA achou 2 bugs (pilha deslocada pelo Tab; fechamento cobrindo a última frase em 360x640), corrigidos. Testes: 236 Vitest + 195 E2E.

  | Foto | Onde | Foco celular | Foco desktop | Ajuste |
  |---|---|---|---|---|
  | perfil-risco-no-cabelo | hero | 50% 0% | 20% 20% | celular mostrava o risco atrás do cabeçalho; sem folga de parallax no celular |
  | retrato-jovem | combo 01 | 50% 10% | 50% 40% | celular mostra testa e cabelo |
  | perfil-pescoco-tatuado | combo 02 | 50% 30% | 68% 50% | desktop centra o rosto |
  | retrato-sorriso-barba | combo 03 | 50% 30% | 50% 25% | desktop mostra olhos a sorriso |
  | carro-farol-molhado | sequência | 50% 22% | 50% 20% | — |
  | tenis-escova-branco | sequência / galeria | 60% 45–50% | 60% 50% | — |
  | retrato-barba-curta | sequência | 55% 40% | 50% 40% | desktop centra olhos e nariz |
  | retrato-serio | galeria | 50% 30% | 50% 26% | cabelo visível |
  | grupo-na-mesa | galeria | 50% 30% | 50% 30% | — |
  | retrato-sorriso-barba | galeria / sucesso | 50% 10–16% | 50% 4–10% | cabelo visível |
  | tenis-escova-luva | galeria | 50% 55% | 50% 55% | — |
  | perfil-pescoco-tatuado | sucesso sem reserva | 50% 30% | 68% 40% | perfil inteiro |

  Pendências de layout (não de foco): no combo 03 desktop o degradê lateral escurece o rosto; selo de preço e código do sucesso cobrem parte de rostos em alguns quadros → Fase 5.

**Fase 3: feita** (visual e segurança sem BLOQUEANTE; feedback externo de 09/10 todo tratado).

## Ponto de retomada (limite de uso atingido)

Última etapa concluída: Fase 3 fechada (commit 7086b34). Próximo passo: Fase 4 (painel) — começar pelo plano de incrementos. Pendências já conhecidas para a Fase 4: painel deve esconder "concluído"/"não compareceu" antes do horário do atendimento (decisão da 2.3) e montar `wa.me` com o telefone canônico (55…). TODOs do dono do repositório: desligar cadastro público no Supabase; apagar agendamentos de teste antigos ("Teste QA") pelo painel do Supabase.

### Feedback externo (segunda leva) — antes da Fase 4

3 itens novos. Decisão do dono do repositório (pergunta direta): avulsos combináveis entre si; combo continua sozinho — CLAUDE.md atualizado no escopo do /agendar.
- F3. Avulsos combináveis: migration (agendamento com lista de serviços, duração e preço somados no servidor), RPCs aceitando vários slugs, front com múltipla escolha e resumo somado.
- F4. Editar reserva sem perder o estado: Editar volta só ao passo, mantém o resto, revalida o horário em vez de apagar; estado do fluxo sobrevive a recarregar.
- F5. Sequência "Você cuida do carro" cadenciada: um gesto intencional = uma frase, sem pular conteúdo (sem GSAP: fora da stack; Motion/Lenis).
- F3 ✔ avulsos combináveis: tabela `agendamento_servicos`, RPCs com `p_servicos text[]` (combo sozinho ou 1–5 avulsos distintos, URB16), duração e preço somados no servidor, nome combinado em `listar_agenda` e na mensagem do WhatsApp; passo 1 com caixas marcáveis (✓) e aviso de limite acessível. Crítico: 2 de acessibilidade + revoke de select (1 rodada). QA: 261 Vitest + 207 E2E; corrigido `agendar-front.test.ts` (3 casos quebrados desde a foto do sucesso no 3.4 — falha do teste, não do produto; eu não tinha rodado `test:seguranca` naquele commit).
- F4 ✔ editar reserva mantém o preenchido: "Editar" abre o passo com tudo marcado e volta direto à revisão; trocar serviço/barbeiro mantém o horário e o passo 3 confere (volta sozinho ou avisa em aria-live); rascunho do fluxo no sessionStorage (30 min desde a última alteração, validado, apagado ao reservar). Lógica do /agendar extraída em hooks (Agendar.tsx 430 → 290 linhas). Crítico: conferência duplicada, validade renovada no reload, extração (1 rodada). QA: fluxo real de edição conferido em `listar_agenda`. Testes: 283 Vitest + 251 E2E.
- F5 ✔ sequência e combos amarrados ao scroll (refeito). A 1ª versão, uma trava por gesto (preventDefault, intervalo e snap), passou por crítico e QA, mas o dono substituiu o item no feedback e pediu para remover a trava. Agora: useScroll → useSpring → useTransform, entrada, pausa e saída por frase, crossfade entre frases, sem preventDefault e sem snap. Números comentados em `src/config/scroll.ts`: 70vh no desktop, 100vh no celular, 35/30/35, sobreposição 0,25, mola 200/29, lerp do Lenis 0,1. As âncoras do header param em 64px (o Lenis já desconta o scroll-margin). Crítico: a mola somada ao Lenis atrasava demais a frase (corrigido com rigidez 200 e 70vh), mais pontos menores de foco e montagem. QA: passada curta no celular deixava a tela vazia entre frases, resolvido com o crossfade. Testes: 296 Vitest + 309 E2E (15 pulados).

### Feedback externo (terceira leva)

O dono substituiu o feedback-externo.md por um item só: tirar a trava da sequência e amarrar a animação à posição do scroll. Tratado no F5 (commit ea9ff24).

## Fase 4: painel

Feedback externo lido no início da fase: nenhum item "novo".

Incrementos:
- 4.1 Login com e-mail e senha (Supabase Auth). A rota `/painel` só abre com sessão. Quem está logado mas não está na equipe vê "sem acesso". Tem botão de sair.
- 4.2 Agenda do dia em colunas por barbeiro (`listar_agenda` + `listar_bloqueios`), com navegação por dia e estados de carregamento, vazio e erro. No celular, as colunas viram abas ou rolagem lateral.
- 4.3 Visão da semana com navegação, para abrir o dia a partir dela.
- 4.4 Ações no agendamento: confirmar, cancelar, concluir e não compareceu (`mudar_status`), mais o botão de WhatsApp do cliente (wa.me com o telefone canônico 55). "Concluir" e "não compareceu" só aparecem depois do início do atendimento.
- 4.5 Bloqueios: criar (folga ou compromisso) e remover (`criar_bloqueio` e `remover_bloqueio`).

Registro:
- 4.1 ✔ login do painel: e-mail e senha, `is_equipe` (já com grant para authenticated, sem migration nova), telas de carregando, sem acesso e erro com "Tentar de novo", `RolagemSuave` desligado no `/painel`, noindex. Crítico: contraste da borda do campo (1,3:1 → chumbo 3:1) e pontos menores de aria e erro (1 rodada). QA: 42 casos novos. Limitação conhecida: apagar o token à mão do localStorage em outra aba não derruba a aba aberta (supabase-js), marcado com `test.fail`; clicar em Sair em outra aba funciona. Testes: 309 Vitest + 362 E2E; o `test:seguranca` tem 49 passando e 1 falha esperada (cadastro público, TODO do dono).
- 4.2 ✔ agenda do dia: colunas por barbeiro (tabela `barbeiros` pela policy da equipe, sem RPC nova), eixo de horas e linha "agora", bloqueios hachurados, cancelado riscado, abas no celular, `?dia=`, atualização silenciosa (ao voltar a aba e a cada 60 s). Crítico: tabpanel incompleto e agenda sem atualização, mais pontos menores (1 rodada). QA: cerca de 60 casos de borda. Pendência menor: "próximo dia" em 9999-12-31 volta para hoje (limite do `somarDias`/`lerDia`, só com URL digitada à mão; marcado com `test.fail`). Testes: cerca de 400 Vitest + 501 E2E; o `test:seguranca` tem 1 falha esperada.
- 4.3 ✔ visão da semana: seletor Dia/Semana na URL, uma chamada por semana (hook base `useDadosDoPeriodo`), total, pendentes e resumo por barbeiro por dia, "Fechado", dia como link com foco no título. Corrigida a pendência do 4.2: botões desabilitados nas pontas. Crítico: foco perdido ao abrir o dia e pontos menores (rodada 2). QA: bloqueio de barbeiro inativo divergia entre Semana e Dia; o Dia agora cria a coluna (rodada 3). Limitação registrada: alternar Dia/Semana recarrega o período. Testes: 445 Vitest; 643 E2E na suíte completa antes da correção final e 336 specs `painel-*` depois dela, 0 falhas.
- 4.4 ✔ detalhes e ações: o bloco abre um dialog nativo (folha no celular, painel lateral no desktop). Ações por status e hora, com 2 etapas e trava de 400 ms em cancelar e "não compareceu". WhatsApp do cliente com o telefone canônico. Migration `20261010100000`: o trigger recusa concluir e "não compareceu" antes do início (URB17), assim a regra fica no banco e não só no front. Crítico: dialog órfão quando o agendamento some da agenda; regra levada ao banco; prefixo "[E2E]" nos dados de teste (rodada 2). QA: duplo toque confirmava a ação destrutiva, pergunta órfã e nome acessível ambíguo (rodada 3). Testes: 533 Vitest; 773 E2E na suíte completa antes da rodada 3 e 472 specs `painel-*` depois, sem falhas. Remoto conferido sem pendentes de teste nos próximos 45 dias.
- 4.5 ✔ bloqueios: criar (barbeiro, dia, intervalo ou dia inteiro, motivo) e remover com 2 etapas, pelas RPCs existentes. `DialogoPainel` concentra o dialog nativo, `erroBloqueio` traduz URB12 a URB15 e conflito com agendamento vira aviso, como o servidor faz. Interrompido no meio e retomado em 19/10, quando o projeto Supabase estava pausado: o QA ficou parado até o dono reativá-lo. Crítico: aprovado com 4 MENORES. A fuga de Tab no `prenderFoco` não se confirmou, e um teste de Tab dentro da trava de 400 ms cobre o caso. QA: removeu um caso contraditório em `painel-agenda-qa` (dois `dia` na URL). Testes: 568 Vitest; segurança 49 + 1 falha esperada; 559 E2E `painel-*` passando (17 pulados). Remoto sem resíduo [E2E].

### Feedback externo (quarta leva), antes do portão da Fase 4

Itens novos: Movimento, Arte e Produto, Visual do site e Painel. Os 4 itens marcados como ideia ficam de fora, por decisão do dono do repositório. Itens repetidos entre os blocos viram um incremento só.
- F6. Lenis sincronizado com o `frame` do Motion; transform das frases da Manutencao separado da centralização (BLOQUEANTE); parallax do "Barber Block" pelo `scrollYProgress`.
- F7. Ritmo do scroll: 60vh, combos 0,25/0,50/0,25, mola 400/40, sobreposição 0, deslocamento 60 px, respiro na saída da Manutencao, `object-position` das fotos em 360px.
- F8. Resumo no topo do painel: total e pendentes do dia ou da semana.
- F9. Cancelados fora da grade por padrão, com opção para mostrar.
- F6 ✔ Lenis no `frame.update` do Motion, sem o quadro de atraso; frases da Manutencao centralizadas por uma div pai, porque o `y` do Motion apagava o `-translate-y-1/2`; parallax do Hero pelo `scrollYProgress`. Crítico: aprovado (1 MENOR recusado: `offsetHeight` lido sem layout pendente não força reflow). QA: spec `f6-*` com 24 casos (centro das frases sem nenhum px de desvio); 174 E2E da landing passando.
- F7 ✔ ritmo: 60vh, mola 400/40, sobreposição 0, deslocamento de 60 px (120 px na última frase), combos 0,25/0,50/0,25, frases 0,33/0,34/0,33 (a pausa subiu para manter a folga de 150 px), `FRASES_RESPIRO` 0,5 antes dos Combos, `object-position` de 3 fotos no celular. Crítico: limiar frágil do teste no meio da troca (50/50) e o `-90` solto, que virou constante (rodada 2). QA: teste instável da roda do Lenis, resolvido no `assentar` (espera `lenis-scrolling` sair). 179 E2E da landing e 7 Vitest novos.
- F8 ✔ resumo no topo do painel: `ResumoPeriodo` com agendados, pendentes (neon, atalho para o primeiro) e confirmados; uma linha de 56 a 80 px no desktop. Regra única `contaComoAgendado` (fora cancelado e não compareceu) no resumo, nos cartões da Semana e no cabeçalho e nas abas do Dia. Houve pausa a pedido do dono do repositório (19 a 22/10). Crítico: resumo com 190 px no desktop e rótulo ambíguo, mais números divergentes entre Semana e Dia (rodada 2). QA: 19 bordas novas. O flake de `painel-semana-qa:376`, anterior ao F8, vinha do relógio futuro: ele fazia o supabase-js renovar o token em paralelo e derrubava a sessão. Corrigido no helper de teste. Testes: 581 Vitest; segurança 49 + 1 falha esperada; 596 E2E `painel-*`, 0 falhas.
- F9 ✔ cancelados fora da grade do Dia por padrão. Botão "Mostrar cancelados (N)" com `aria-pressed` e `?cancelados=1`. Ligado, o cancelado fica riscado, com 70% de opacidade e atrás do ativo, em cinza-claro (cerca de 6:1). `montarBuscaPainel` centraliza a URL do painel. Crítico: aprovado. 2 MENORES ficam para a Fase 5: dia só com cancelados deveria dizer "N cancelados ocultos" na coluna; um cancelado fora da faixa de horas conta no (N) mas não aparece. QA rodada 1: bug, o filtro se perdia ao abrir o dia pelo cartão da Semana ou pelo link de pendentes (corrigido na rodada 2). Testes: 593 Vitest; segurança 49 + 1 falha esperada; 674 E2E `painel-*`. Instáveis sob carga, passando isolados: `painel-acoes-qa:228` (celular) e `painel-bloqueios:342/361` (desktop). Ficam para a Fase 5.

### Portão da Fase 4 (22/10/2026)

feedback-externo.md: nenhum item "novo" (os 4 itens de ideia foram recusados por decisão do dono do repositório).
- Visual: **8/10** (fidelidade 8, sem cara de template 8, celular 8). APROVADO COM AJUSTES, sem BLOQUEANTE. Os IMPORTANTES vão para a Fase 5: o fim da sequência ("E O VISUAL?" some no último quadro), "Bloquear horário" e "Mostrar cancelados" em linhas separadas no desktop, a metade esquerda do login vazia no desktop. Os MENORES também: botão de criar bloqueio cortado a 360px, rótulo "Ocultar cancelados" quando ligado, etiqueta da linha do agora, borda de hoje na Semana desalinhada, lista solta do combo 1.
- Segurança: **SEGURO COM AJUSTES**, sem BLOQUEANTE. Todos os ataques de anon e da equipe contra o painel foram barrados (42501), e não há segredo no `dist`. IMPORTANTE (TODO do dono): cadastro público ainda ligado (`disable_signup:false`). MENOR: `criar_agendamento` checa o limite de pendentes (URB06) antes do horário e revela se um telefone tem pendentes (vai para a Fase 5). Teste novo `tests/seguranca/painel-fase4.test.ts` (11 casos). Ficaram 12 agendamentos `[E2E] Seguranca F4` como cancelados, porque não há delete pela API, de propósito.

**Fase 4: feita.**

## Fase 5: polimento

feedback-externo.md lido no início da fase: nenhum item "novo".

Incrementos:
- 5.1 Pontos IMPORTANTES do visual: fim da sequência "E O VISUAL?" forte, com o fechamento ao lado e linha neon; barra única de ações no Dia; foto P&B com recorte diagonal na metade vazia do login no desktop.
- 5.2 Pontos MENORES do painel: "N cancelados ocultos" na coluna; "Ocultar cancelados" quando ligado; cancelado fora da faixa de horas; botão de criar bloqueio fixo na folha a 360px; etiqueta da linha do agora; borda de hoje na Semana; `useCancelados` reaproveitado.
- 5.3 Banco: `criar_agendamento` valida horário, antecedência e janela antes do anti-spam (URB06), numa migration nova.
- 5.4 Landing e /agendar: estados de carregamento e erro revisados; pendências de layout da Fase 1 (degradê no rosto do combo 03, selo e código cobrindo rostos); lista do combo 1 em 2 colunas.
- 5.5 Acessibilidade e performance: varredura axe nas 3 rotas, Lighthouse no celular (meta: 90 ou mais em acessibilidade e boas práticas), imagens e fontes.
- 5.6 Testes instáveis sob carga: `painel-semana:428/459/468` (celular), capturas `captura-painel*`, `painel-acoes-qa:228`, `painel-bloqueios:342/361/490`, `painel-cancelados-qa:130`, `fumaca:5` (celular) e o parallax do hero em `f6` (desktop).

Registro:
- 5.1 ✔ clímax da sequência: "E O VISUAL?" fica branca e o fechamento entra abaixo dela, com uma linha neon que se desenha. Barra única no Dia. Foto P&B com recorte diagonal no login do desktop (o celular não baixa a foto). Crítico: número de ritmo solto no componente e risco de colisão do fechamento em telas baixas, conferido em 4 tamanhos com um E2E que mede as caixas (rodada 2). Falha minha: o teste de segurança do portão foi commitado com um erro de TypeScript (`t2` sem uso) que quebrava o `tsc -b`. O dev corrigiu, e daqui para a frente rodo o typecheck antes de cada commit. Testes: 593 Vitest; 1031 E2E (3 instáveis sob carga, passando isolados).
- 5.2 ✔ menores do painel: coluna com "N cancelados ocultos", botão Mostrar/Ocultar (sem `aria-pressed`, o estado vai para a região aria-live), faixa de horas cobre o cancelado exibido, rodapé sticky no bloqueio a 360px com `scroll-pb-24` (foco nunca atrás dele), etiqueta neon na linha do agora, borda de hoje alinhada na Semana, `useCancelados` reaproveitado. Interrompido e retomado em 23/10. Crítico: aprovado com MENORES (foco atrás do rodapé e números soltos, aplicados; faltavam E2E). QA: `painel-52-qa` com 18 casos, sem bug. Testes: 606 Vitest; 749 E2E (`painel-*`, `f51-*`, capturas), 0 falhas; segurança 60/61 (cadastro público, TODO do dono).
- 5.3 ✔ `criar_agendamento` valida nome, telefone, serviços, barbeiro e horário antes do limite de pendentes (URB06), na migration `20261023100000`, aplicada no remoto. Assim, um horário inválido não revela mais se o telefone tem pendentes. Resíduo inevitável: com um horário válido, o URB06 ainda aparece (mitigação: captcha, risco conhecido). Crítico: aprovado. QA: o teste lê `config`/`funcionamento` do remoto em vez de depender do seed, mais concorrência (3 paralelos, 1 vaga → 1 passa). Testes: 607 Vitest; 148 E2E `agendar*`; segurança 60/61.
- 5.4 ✔ estados do /agendar (500/502 HTML, 20 s nos horários, reenvio no alerta, aviso de envio demorado após 15 s sem abortar, `ErroDeRota`, reserva expirada e fim da janela com WhatsApp) e layout dos combos (selo ancorado ao texto, véu do combo 3 na largura do texto, código abaixo da foto, lista em 2 colunas). Os dados da landing e as listas do /agendar são estáticos, então não precisam de estado. Crítico: envio travado sem saída, selos calibrados só em 1440x900 e véu curto sob a lista (rodada 2). QA: selo do combo 3 saía do post em 1024x640, e o `ErroDeRota` ficava preso porque o `React.lazy` guarda o import falho (rodada 3). Testes: 609 Vitest; 1139 E2E com 3 workers, 3 falhas do `painel-semana` só sob carga (76/76 isoladas, vão para o 5.6); segurança 60/61. Fica para depois (MENOR): desktop abaixo de 640 px de altura não foi medido.
- 5.5 ✔ acessibilidade e performance: axe (wcag2a/aa/21aa/22aa) zerado nas 3 rotas, inclusive na landing com movimento. O contraste que o axe deixa como incomplete é medido em pixels (`e2e/ajudas-contraste.ts`). Skip link `PularParaConteudo`, `foco-teclado.spec`, `scroll-margin` nas opções, `dl` válido, Galeria sem `role=region`, preload da fonte e, só em "/", da foto do hero (`src/data/hero.ts` + teste de alinhamento), `robots.txt`. Lighthouse mobile: `/` 63→83 de performance (LCP 3,7 s, limitado pelo JS de 456 kB e pela revelação diagonal do hero, decisão de design), 100/100/100 em acessibilidade, boas práticas e SEO; `/agendar` 94/100/100/100. Pausado e retomado em 23/10. Crítico: landing só varrida com reduced-motion, preload duplicado sem guarda (rodada 2), ponto cego da medida com letra clara sobre fundo claro (rodada 3). Restou 1 IMPORTANTE no helper: o fundo apaga `currentColor` e SVGs. Exceção autorizada pelo dono do repositório (DECISOES.md) → 5.5b. QA: sem bug; 612 Vitest; 1262 E2E (1 instável sob carga, passa isolado); a11y estável em 3 execuções. Nota: o login do painel no desktop baixa a foto do hero, que ele usa de propósito (5.1). Sem CSP no projeto: se um CSP entrar, o script inline do preload vai precisar de hash.
- 5.5b ✔ helper de contraste: o fundo medido mantém `currentColor`/SVG, `<text>` de SVG usa `fill`, as animações ficam pausadas em vez de removidas, e 3 controles novos. Crítico: aprovado (MENORES: `fill` não-rgb e `-webkit-text-fill-color` ficam como limites). QA: a mutação com o bug de volta faz os controles falharem; `a11y` 85/86 estável (o pulado é a frase só de desktop).
- 5.6 ✔ E2E estáveis sob carga (só testes, app sem mudança): ajudas-login.ts (login real no beforeAll, storageState por worker, is_equipe simulado nos testes de tela, relógio simulado sem derrubar a sessão), portão em vez de atraso no "Salvando…", parallax amostrado depois do quadro, a11y espera a sequência montar e a tela assentar antes do axe. 3 rodadas: QA r1 e r2 pegaram flakies do a11y (crossfade medido no meio; trilho calculado antes da troca para a versão presa). Crítico r3: espera do sticky travaria com reduced-motion, corrigida antes do QA. QA r3: 612 Vitest; E2E 1285/0 em 2 execuções seguidas com 3 workers; a11y 425/0 com repeat-each=5. fumaca:5 não reproduziu (causa inferida: build refeito com o preview rodando).
- 5.7 ✔ (vindo do portão) aviso de envio demorado e erro ao confirmar no passo 5 do /agendar ficam à vista: `scrollIntoView` com block nearest + `scroll-mb-40` (folga da barra fixa), foco no erro, que vira `role="group"` com `aria-labelledby` (um anúncio só). Crítico: anúncio duplo e `block:'center'` ignorando a barra (1 rodada). QA: `f57-erro-foco-qa` (12 casos) + `captura-f5`; 612 Vitest; 1301 E2E com 3 workers, 0 falhas.

### Portão da Fase 5

feedback-externo.md lido antes do portão: nenhum item "novo".
- Visual: **8/10** (fidelidade 9, sem cara de template 8, celular 8). APROVADO COM AJUSTES, sem BLOQUEANTE. Os 3 IMPORTANTES (aviso de demora e erro do passo 5 fora da vista) viraram o 5.7. MENORES pendentes: grade de 30 dias ocupa a dobra no desktop (passo 3); dia "FECHADO" com atendimentos na Semana deveria avisar; listras dobradas entre combos 2 e 3 com reduced-motion no desktop; ~250 px vazios no pé das telas da sequência no celular e primeira foto da galeria lenta ao saltar direto (`loading="eager"`). Observação não reproduzida: revisão vazia por 1,2 s numa aba aberta logo após outra com envio travado (conferir a trava de sessão do Supabase entre abas).
- A Fase 5 não tem portão de segurança.
- **Fase 5: feita.**

## Relatório final

### Status por fase
| Fase | Status |
|---|---|
| 0 setup | feita |
| 1 landing | feita (visual aprovado) |
| 2 banco | feita (segurança aprovada) |
| 3 /agendar | feita (visual e segurança aprovados) |
| 4 painel | feita (visual 8/10, segurança SEGURO COM AJUSTES) |
| 5 polimento | feita (visual 8/10, APROVADO COM AJUSTES) |

### Testes (último ponto medido, 24/10/2026)
- Vitest: 612 em 37 arquivos, 0 falhas.
- Segurança (`npm run test:seguranca`): 60/61. A única falha é o cadastro público ainda ligado (`disable_signup:false`), TODO do dono.
- E2E Playwright (celular 360x800 + desktop 1440x900): 1301 passaram, 55 pulados (condicionais de viewport), 0 falhas com 3 workers. Antes do 5.7 passaram 2 execuções seguidas limpas.
- Lighthouse mobile: `/` 83/100/100/100 (LCP 3,7 s); `/agendar` 94/100/100/100.

### Pontos que ficaram para depois
- Visual (Fase 5, MENORES): os quatro listados no portão acima.
- Crítico: desktop abaixo de 640 px de altura não foi medido (5.4); helper de contraste não trata `fill` não-rgb nem `-webkit-text-fill-color` (5.5b); a espera `aguardarTelaAssentada` só enxerga opacidade inline e animações Web Animations, não transições de classe (5.6).
- Testes: `fumaca:5` e as causas de rede do painel foram corrigidos por inferência, não reproduzidos. Nunca rode `npm run build` com o preview ligado.
- Performance: o LCP da landing é limitado pelo JS (456 kB) e pela revelação diagonal do hero (decisão de design).
- Sem CSP ainda: o script inline do preload vai precisar de hash quando entrar.
- Risco conhecido: alguém pode lotar a agenda com pendentes falsos usando telefones diferentes. Mitigação futura: captcha (Turnstile) e expiração de pendentes. Está na fila da auditoria final.

### Notas finais do visual
Fase 5: 8/10, APROVADO COM AJUSTES. Fiel aos posts: hero gigante assimétrico, combos empilhados com preço carimbado em neon, frases uma por vez, CTA de largura total, neon racionado, P&B. Com reduced-motion todo o conteúdo fica visível. Estados de carregamento, vazio e erro estão na linguagem da marca.

### Veredito final da segurança
Fase 4: SEGURO COM AJUSTES, sem BLOQUEANTE. Anon e equipe barrados em todos os ataques ao painel (42501) e nenhum segredo no `dist`. O único IMPORTANTE é o cadastro público, que depende do dono. O vazamento do URB06 antes da validação do horário foi corrigido no 5.3.

### TODOs do dono
- Desligar o cadastro público no Supabase: Authentication > Sign In / Providers > "Allow new users to sign up".
- Conferir e apagar os agendamentos `[E2E]` e "Teste QA" que sobraram. Os 12 `[E2E] Seguranca F4` cancelados são esperados, porque não há delete pela API.
- Confirmar os dados fictícios marcados `TODO: confirmar com o dono` (durações, avulsos, barbeiros, horário, almoço, intervalo, antecedência, janela, limite de pendentes, WhatsApp, endereço, Instagram) e os placeholders `[EXEMPLO]`.

### Comandos locais
```
npm install
npm run dev              # http://localhost:5173
npm run typecheck && npm run lint
npm test                 # Vitest
npm run test:seguranca   # ataques com a chave pública contra o Supabase
npm run build && npx playwright test --workers=3   # E2E sobre build + preview (4173)
npx supabase migration list   # conferir migrations no remoto
```

### 3 commits para estudar
1. `6ed6d61` (5.3): regra de negócio no banco. Mostra por que a ordem das validações numa função `security definer` importa: validar o horário antes do anti-spam evita revelar se um telefone tem pendentes. Traz também um teste de concorrência.
2. `77397db` (F6): Lenis rodando no mesmo quadro do Motion. É a base de todo o movimento ligado ao scroll e mostra como dois sistemas de animação brigam quando não dividem o relógio.
3. `d87690e` (F8): regra única `contaComoAgendado`. Um bug clássico, números diferentes em telas diferentes, resolvido com uma função pura testada que as duas telas usam.

## Auditoria de segurança final (antes de publicar)

Pedido do dono em 24/10/2026. O seguranca auditou e o dev corrige, com um commit por correção. Veredito da auditoria: **SEGURO COM AJUSTES**.

Plano:
- S1 `vercel.json`: rewrite de SPA e headers (CSP com hash do script inline, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) + testes do hash e de zero violação de CSP.
- S2 expiração de pendente não confirmado em 2 h: pg_cron mais expiração preguiçosa em `criar_agendamento`/`_slots_livres`.
- S3 limite global de criação de agendamentos (por minuto e por hora), no banco.
- S4 honeypot no formulário do /agendar, validado no servidor.
- S5 DECISOES.md: por que não há captcha agora e o que o Turnstile exige.

Registro:
- Teste novo `tests/seguranca/fora-da-equipe.test.ts` (782e797): 6 tokens forjados ou adulterados barrados com 401, mais o controle com o token real. `test:seguranca` deu 68/69 (só o cadastro público).
- S1 ✔ `vercel.json` (c58e529): o rewrite de SPA ignora `/assets/` e caminhos com ponto, então asset inexistente dá 404 (conferido com `@vercel/routing-utils`). CSP com o hash do único script inline, `style-src 'self'` sem unsafe-inline (Motion e Lenis usam CSSOM), `connect-src` só para o Supabase, mais X-Frame-Options DENY, nosniff, Referrer-Policy e Permissions-Policy fechada. Crítico: rewrite largo demais e hash conferido só na fonte (1 rodada). QA: 619 Vitest; `csp.spec` 24/24 com repeat-each=3; `csp-qa` cobre o sucesso do /agendar, o painel logado e o 404, sem violações. Só um deploy confirma os headers reais (`curl -I`).
- S2 ✔ expiração de pendente em 2 h (9f500a4): o vencido vira cancelado com `expirado_em`, via pg_cron a cada 5 min e também dentro de `criar_agendamento` e `mudar_status`. Slots livres, URB06, conflitos de bloqueio e a carga do "sem preferência" ignoram o vencido. O prazo fica em `config.expira_pendente_min` (120, TODO: confirmar com o dono). O painel mostra "Expirado". Crítico: a função de teste `teste_envelhecer_agendamento` fica no banco (só equipe, só pendente "Teste%"; risco e `drop` em DECISOES.md), confirmar vencido, deadlock com o cron (skip locked) (1 rodada). Desvio aceito: `mudar_status` num vencido devolve a linha expirada em vez de erro, porque o erro desfaria a expiração. QA: 632 Vitest (1 instável fora da S2: `servicos-combinados:135` com URB05 em paralelo, passa isolado); segurança 74/75; 1321 E2E com 3 workers, 0 falhas. O job no `cron.job` não dá para ler com a chave pública: confira no painel do Supabase (Integrations > Cron).
- S3 ✔ limite global de criação (URB18): 10/min e 30/h de agendamentos não cancelados (TODO: confirmar com o dono), sob advisory lock global; com a expiração de 2 h, o robô fica limitado a uns 60 pendentes falsos vivos. `teste_criar_agendamento` (só equipe, "Teste%") marca `fora_do_limite` para a suíte não gastar a cota real; anon não grava nem lê a coluna. Crítico rodada 1: a primeira versão (100/min, 120/h) foi calibrada pelos testes, não pelo uso real; corrigido. Rodada 2: sem pontos. QA: 642 Vitest; segurança 86/87; 1327 E2E com 3 workers, 0 falhas; `agendar-urb18-qa` novo. Margem: duas rodadas de teste sobrepostas fazem 10 criações públicas no mesmo minuto (o teto), então não acrescente testes pelo caminho público. Risco que fica: um robô pode manter a cota cheia e negar agendamento a clientes reais até entrar o Turnstile.
- S4 ✔ honeypot (2be3d9f): campo `url_empresa` ("Deixe em branco") fora da tela, fora do Tab, com aria-hidden e fora do rascunho. `criar_agendamento(p_website)` recusa com URB20 antes de qualquer outra checagem, sem gravar e sem gastar a cota. Depois do URB20, o front zera o campo e oferece "Tentar de novo". Crítico: o nome "website" atraía o autofill e prendia cliente real (1 rodada). QA: 648 Vitest; segurança 87/88; 1337 E2E com 3 workers, 0 falhas; 15 URB20 seguidos não consomem cota; a chamada antiga sem `p_website` continua aceita.
- S5 ✔ DECISOES.md (b1b725b): por que o demo não tem captcha e os 5 passos para o Turnstile na versão final (chaves, widget + CSP, Edge Function com siteverify, revoke de anon na RPC, chaves de teste oficiais).

### Resumo da auditoria

**O que estava ok**
- Segredos: nenhuma chave secreta, senha ou token no histórico (68 commits), no código nem no `dist/` (só a chave publishable, esperada). `.env` nunca foi versionado e está no `.gitignore`.
- Acesso restrito: anon não lê nenhuma tabela, não escreve direto e não executa função do painel nem interna. Logado fora da `equipe` não vê nada; os 6 tokens forjados ou adulterados foram barrados com 401 (`fora-da-equipe.test.ts`). Todas as policies e funções do painel checam `is_equipe()`.
- Front: sem `dangerouslySetInnerHTML`; os 11 links externos têm `rel="noopener noreferrer"`; o `wa.me` usa `encodeURIComponent`.
- Dependências: `npm audit --omit=dev` deu 0 vulnerabilidades.

**O que foi corrigido** (um commit por correção)
- `782e797` teste de usuário fora da equipe com tokens forjados.
- `c58e529` `vercel.json`: rewrite de SPA (sem ele `/agendar` dava 404 na Vercel) + CSP com hash, X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy.
- `9f500a4` pendente não confirmado expira em 2 h (pg_cron + expiração preguiçosa).
- `d44932b` limite global de 10 criações/min e 30/h (URB18).
- `2be3d9f` honeypot no /agendar (URB20).
- `b1b725b` decisão do captcha e roteiro do Turnstile.

Testes no fim da auditoria: 648 Vitest; segurança 87/88 (a única falha é o cadastro público); 1337 E2E com 3 workers, 0 falhas.

**Risco conhecido que fica**
- Cadastro público ainda ligado (`disable_signup:false`). O dono desliga em Authentication > Sign In / Providers > "Allow new users to sign up". Hoje quem se cadastrasse não veria nada (por causa do `is_equipe()`), mas é a última trava que falta.
- Robô que chama a RPC direto: o honeypot não pega; o limite global segura, mas ele pode manter a cota cheia e negar agendamento a clientes reais por até 1 h. Com a expiração, ficam no máximo uns 60 pendentes falsos vivos. A solução é o Turnstile com Edge Function (DECISOES.md).
- URB06 ainda revela se um telefone tem 2 pendentes quando o horário é válido (MENOR).
- Duas funções de teste ficam no banco de produção, ambas só para a equipe e só com nome "Teste%": `teste_envelhecer_agendamento` e `teste_criar_agendamento` (esta não conta no limite). Comandos para remover estão em DECISOES.md. Removê-las faz os testes de expiração e limite pularem.
- Os testes gravam no mesmo projeto Supabase do demo. A cota pública de testes está no limite (duas rodadas sobrepostas = 10 criações/min). Solução definitiva: um projeto Supabase separado para testes.
- Os headers reais da Vercel só se confirmam depois do primeiro deploy: `curl -I https://<domínio>/agendar` e um asset inexistente (tem de dar 404).
- O pg_cron (`urbz-expirar-pendentes`, a cada 5 min) não dá para conferir com a chave pública. Confira em Integrations > Cron no painel do Supabase.
- Valores fictícios com `TODO: confirmar com o dono`: expiração de 120 min, limite de 10/min e 30/h.

**Dados de teste para apagar antes de mostrar ao cliente**
Levantamento de 24/10 (os testes criaram mais desde então): 1.503 agendamentos, **todos de teste**, e nenhum bloqueio. Nomes: Teste QA (815), Teste Combinado (156), Teste Painel (104), Teste Automatico (79), Teste QA Edicao (40), QA Ponta a Ponta (40), [E2E] Seguranca F4 (40), [E2E] Painel, Teste Fumaca (5), Teste Limite (2), teste (2), mais 194 cancelados de testes de segurança com nomes variados ("Seg…", "AAA…", `<script>`, `<img>`).
Os que atrapalham o demo (não cancelados):
- `6GZDFV` "teste", confirmado, 13/10/2026 10:30.
- 48 "Teste QA" **concluídos em 07/11/2026** (sábado), das 09:00 às 17:30, 3 por horário. Eles lotam o sábado inteiro no /agendar e o painel não consegue liberar, porque "concluído" é estado final. Códigos: QFBG9P 6XS5CK F86T4R TR8K6J JMSPSP HJJ2W2 KVRHRP ZA4XHP BV8U8D MMF6HD K7BJ7K CHSYUE 8R4CA6 DR9BYS V566DU M8KF7E 79WMSQ 23Z2U5 VASXHS 94EDGW TCS8Z5 C4T432 CVF3VB 5AEATN FQRBTJ V2R3NR G4ZC6Q ZSYBJW 4Y8BH6 CN6DE3 XV2EQ8 AB9KUH GAMA4C T9U8DX 6XDC3H EDFPG9 ZDMS3H VQKZDS 655DXQ FX3M6J 43XMYK RRKJP9 KH9G2H EGSQ3U X29856 U64KJE YKSDTN GSC8D2.

Como apagar (SQL Editor do Supabase, logo antes da apresentação, porque os testes continuam gravando no mesmo projeto):
```sql
select count(*) from public.agendamentos;   -- conferir antes
delete from public.agendamentos;            -- hoje 100% é teste; agendamento_servicos vai junto por cascade
```
Se já houver agendamento real, troque por um filtro: `where cliente_nome ilike '%teste%' or cliente_nome ilike '[E2E]%' or cliente_nome ilike '%QA%'`. Confira o `select` com o mesmo filtro antes.
