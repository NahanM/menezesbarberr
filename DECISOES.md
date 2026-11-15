> Estas decisões vieram do demo da URBZ Barber Block, de onde este projeto nasceu. Continuam valendo para o banco,
> o /agendar e o /painel. O que mudou para a MENEZES BARBER's está no README e no CLAUDE.md.

# Decisões de arquitetura (modo autônomo)

Formato: decisão / alternativa descartada / motivo.

**Neon #DFFE04.** Tom lido do logo em vez do #D4FF00 aproximado do CLAUDE.md. Motivo: o CLAUDE.md manda confirmar pelo logo.
**Bebas Neue sem Anton.** Uma fonte de display só, fallback Impact. Motivo: Anton nunca seria usada e pesaria no bundle.

**Fotos recortadas dos próprios posts da URBZ (`referencias/`).** Alternativa: banco de imagens. Motivo: foto de outra barbearia queima o demo; recorte em baixa resolução vira TODO (pedir originais ao dono).
**Landing lê dados de um arquivo estático (`src/data/barbearia.ts`).** Alternativa: buscar do Supabase já na Fase 1. Motivo: o banco só existe na Fase 2; landing estática carrega mais rápido e não depende do .env. `/agendar` lê do banco.

**Front anônimo identifica serviço e barbeiro por slug, com catálogo vindo de `src/data/barbearia.ts`.** Alternativa: função pública `listar_catalogo` ou select anônimo nas tabelas. Motivo: o CLAUDE.md permite ao anon só `horarios_disponiveis` e `criar_agendamento`; o seed espelha o arquivo e um teste de integração garante que todo slug do front existe e está ativo no banco.
**Status `nao_compareceu` continua ocupando o horário; só `cancelado` libera.** Alternativa: liberar também no-show. Motivo: o atendimento já passou; liberar o horário no passado não tem utilidade e o CLAUDE.md fala em ignorar só cancelados.
**Testes de integração rodam no projeto remoto e cancelam o que criaram com a sessão da equipe.** Alternativa: Supabase local via Docker. Motivo: o pré-requisito do projeto é o remoto linkado; cancelado não ocupa agenda.
**Transições de status garantidas por trigger no banco.** Alternativa: validar só numa RPC `mudar_status`. Motivo: o trigger vale para qualquer caminho de update (inclusive bug no painel).
**`alter default privileges` não cobre objetos criados pelo painel do Supabase.** Por isso toda migration que cria função mantém `revoke ... from public, anon` explícito.
**Originais das fotos (`scripts/fontes/`, 13 MB) versionados uma vez.** Alternativa: deixar fora do git. Motivo: `npm run fotos` precisa deles para regerar os WebP; só são trocados se o dono mandar fotos novas.
**Logo em SVG vetorizado do JPG novo.** Alternativa: recorte raster com alfa. Motivo: desenho geométrico, SVG fiel fica nítido em qualquer tamanho; TODO pedir o arquivo original ao dono.
**Avulsos combináveis via tabela `agendamento_servicos`; `agendamentos.servico_id` guarda o principal.** Alternativa: array de ids em `agendamentos`. Motivo: mantém FK, índices e funções antigas; preço e duração copiados no momento da reserva. Decisão de escopo tomada pelo dono do repositório (combo não se mistura com avulso).
**Sequência e combos amarrados à posição do scroll, sem trava.** Alternativa: trava por gesto (preventDefault na roda, intervalo e snap). Motivo: pedido do dono; nenhuma rolagem ignorada, a "pausa" é distância de rolagem e os números ficam em `src/config/scroll.ts` para ajuste manual.

## Exceção à regra das 3 rodadas no 5.5 (23/10/2026)
- Decisão: commitar o 5.5 depois da 3ª rodada mesmo com 1 IMPORTANTE do crítico em aberto, porque o ponto está só no helper de teste `e2e/ajudas-contraste.ts` (o fundo medido apaga também `currentColor` e SVGs). A correção vira o incremento 5.5b, com crítico e QA próprios. A decisão foi do dono do repositório.
- Alternativa descartada: encerrar a execução na Fase 5, como manda o orquestrador.
- Motivo: o QA aprovou sem bug de produção (axe zerado, 1262 E2E). Parar o projeto por um refinamento do instrumento de medida custaria mais do que o risco.

## CSP no vercel.json (auditoria de segurança, S1)
- Decisão: `style-src 'self'` sem `'unsafe-inline'`. Motion, Lenis e React escrevem estilo por `element.style` (CSSOM), que a CSP não bloqueia; o CSS do Tailwind e das fontes sai como arquivo no build. O `index.html` não tem `<style>` nem atributo `style`. `e2e/csp.spec.ts` confirma: zero violações em `/`, `/agendar` (com horários do Supabase) e `/painel` (login), nos dois viewports.
- Decisão: `script-src` com o hash sha256 do único script inline (preload do hero), não `'unsafe-inline'`. Se o script mudar, `tests/vercel-csp.test.ts` falha até o hash ser atualizado.
- Decisão: host do Supabase fixo no `connect-src` (a URL não é segredo). O teste confere que é o do `VITE_SUPABASE_URL`.
- Alternativa descartada: `preview.headers` no `vite.config`. Motivo: aplicaria a CSP em todos os ~1.200 E2E existentes; o spec injeta o header só nas suas páginas, com `page.route`.

## teste_envelhecer_agendamento fica no banco (auditoria de segurança, S2)
- Decisão: a função existe só para os testes de integração simularem "pendente criado há mais de 2 h" (recua `criado_em`; a API não escreve em `config` e o service_role nunca entra no repo). Só a equipe executa, só em pendente, só com cliente "Teste%", e os testes pulam sozinhos se ela não existir.
- Risco: o prefixo "Teste" pode ser usado por qualquer anônimo ao agendar; mesmo assim só a equipe chama a função, e o efeito é expirar mais cedo um pendente chamado "Teste...".
- Para remover (os testes de expiração passam a ser pulados): `drop function if exists public.teste_envelhecer_agendamento(text, integer);`

## Limite global de criações: 10 por minuto, 30 por hora (auditoria de segurança, S3)
- Decisão: URB18 acima desses tetos somados de todos os visitantes (TODO: confirmar com o dono). Os testes é que se ajustaram: linhas criadas por `teste_criar_agendamento` (só equipe, nome "Teste%") ficam marcadas `fora_do_limite` e não contam; uma execução completa passa por `criar_agendamento` pública só ~6 vezes. Sem bypass para anônimo (só essa função da equipe marca a linha).
- Cancelado não conta (só a equipe cancela) e a config exige `expira_pendente_min >= 60`, então a expiração nunca devolve cota dentro da janela de 1 h. Remover o caminho de teste: `drop function if exists public.teste_criar_agendamento(text[], text, timestamptz, text, text, integer, integer, timestamptz, boolean);`.
- Risco: robô pode manter a cota cheia e negar agendamento a clientes reais; mitigação futura: Turnstile. A solução definitiva para os testes é um projeto Supabase separado só para eles.

## Honeypot "website" no /agendar: recusa com erro URB20 (auditoria de segurança, S4)
- Decisão: `criar_agendamento` ganhou `p_website` (último parâmetro, padrão null). Preenchido, recusa com URB20 antes de tudo (antes da validação e do limite global, então o robô não gasta a cota de ninguém), sem gravar nada. Escolhi erro e não "falso sucesso": o robô não recebe código real, e quem foi pego por um preenchimento automático do navegador vê uma mensagem em vez de achar que reservou.
- Limite honesto: quem chama a RPC direto simplesmente não manda o campo. O honeypot só pega robô de formulário; não substitui o limite global (URB18) nem o Turnstile futuro.
- No front o valor mora fora de `dados` (estado `website` em Agendar.tsx), então nunca vai ao rascunho do sessionStorage.
- Autofill: o campo se chama `url_empresa` (sem semântica de autofill) e o rótulo é "Deixe em branco"; em URB20 o front zera o campo e deixa "Tentar de novo", para quem foi pego por engano não ficar preso. Não há teste automatizado de autofill real de navegador (só simulamos o campo preenchido).

## Sem captcha no demo; Turnstile na versão final (24/10/2026)

Decisão: o demo não tem captcha. A defesa contra robô fica em três camadas no banco e no formulário: a expiração do pendente em 2 h (S2), o limite global de 10/min e 30/h (S3) e o honeypot (S4).
Por quê agora não:
- Um captcha que valha alguma coisa precisa ser validado no servidor. Isso pede uma Edge Function ou outro backend com a chave secreta, e esse backend tem de ser o único caminho para criar agendamento.
- Hoje o anon chama `criar_agendamento` direto pela chave publishable. Um widget só no front seria enfeite: o robô chama a RPC sem passar por ele.
- Além disso, criar a conta na Cloudflare e guardar a secret fica fora do escopo deste demo, que não cria contas nem guarda segredos.
- Também pesou a apresentação: com captcha, o dono veria um desafio no meio do agendamento.

O que é preciso para o Cloudflare Turnstile na versão final:
1. Criar o site no painel da Cloudflare (Turnstile) com os domínios de produção e de preview. A site key vai para `VITE_TURNSTILE_SITE_KEY`. A secret key fica só como secret da Edge Function (`supabase secrets set`), nunca no repo nem no `.env` do front.
2. Front: widget Turnstile no passo 5 do /agendar (modo "managed", tema escuro). O token segue junto no envio. Na CSP do `vercel.json`, acrescentar `https://challenges.cloudflare.com` em `script-src` e `frame-src` (hoje `frame-src 'none'`), e conferir o `e2e/csp.spec.ts`.
3. Edge Function `agendar`:
   - recebe os dados e o token e valida o token em `https://challenges.cloudflare.com/turnstile/v0/siteverify` (secret, token, IP, e `idempotency_key` para não reaproveitar);
   - só então chama a criação no banco;
   - na CSP, `connect-src` passa a incluir `https://<ref>.functions.supabase.co`, ou o mesmo host do Supabase, se a função usar `/functions/v1`.
4. Banco: tirar o grant de `criar_agendamento` para anon e deixar só a Edge Function chamar, com uma role própria ou service_role dentro da função. Assim a RPC deixa de ser um caminho que pula o captcha. O limite global, a expiração e o honeypot continuam como segunda linha.
5. Testes:
   - Turnstile tem chaves de teste oficiais que sempre passam ou sempre falham; usar essas no E2E e no CI;
   - teste de segurança: anon chamando a RPC direto passa a dar 42501.
