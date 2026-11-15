# MENEZES BARBER's: site + agendamento (demo)

Site da barbearia MENEZES BARBER's (Pato Branco/PR): página inicial com topo em camadas, agendamento próprio (`/agendar`) no lugar do AppBarber e painel da equipe (`/painel`). As regras de negócio vivem no banco (Supabase), em funções SQL chamadas por RPC.

Este projeto nasceu do demo da URBZ Barber Block (`NahanM/URBZ`). Banco, regras de agendamento e painel vieram de lá sem mudança de estrutura. O que mudou: dados da barbearia, cores, fontes, página inicial e fotos. Por isso alguns nomes internos ainda são da URBZ (token de cor `neon`, curva `ease-urbz`, códigos de erro `URBxx`, chaves `urbz:`). Veja `CLAUDE.md` para identidade visual, regras e segurança, e `DECISOES.md` para as decisões de arquitetura herdadas.

## Estado atual

- Compila (`npm run build`), passa no lint e nos testes de unidade (`npx vitest run tests/agendar tests/painel tests/dados-menezes`).
- **O banco ainda precisa do seed da Menezes** (passo "Banco" abaixo). Sem ele, o `/agendar` abre mas não acha horário, porque o banco ainda conhece só os serviços do demo anterior.
- Os testes de integração (`tests/integracao`) e os de tela (`e2e/`) vieram da URBZ e **ainda não foram adaptados**: citam serviços, barbeiros e textos de lá. Os de tela da página inicial antiga foram removidos.

## Stack

React 19, React Router 8, Vite 8, TypeScript 6, Tailwind CSS 4, Motion, Lenis, Supabase JS 2, Vitest 5, Playwright. Fontes via @fontsource: Anton (títulos) e Inter (texto). Node 22 ou 24.

## Comandos

```
npm install        # instala dependências
npm run dev        # servidor de desenvolvimento
npm run build      # checa tipos e gera dist/
npm run preview    # serve o build (porta 4173)
npm run lint       # ESLint
npm run typecheck  # TypeScript sem gerar arquivos
npm test           # Vitest: unidade + integração (a integração fala com o Supabase do .env)
npm run test:e2e   # Playwright (sobe build + preview sozinho)
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. O `.env` fica fora do git. Na Vercel, cadastre as duas `VITE_` em Settings > Environment Variables.

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (front) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública (publishable) do Supabase (front) |
| `E2E_EMAIL` | e-mail do usuário da equipe usado nos testes |
| `E2E_SENHA` | senha desse usuário, só para testes |

Chave secreta (`service_role`/`secret`) e senha do banco nunca entram no repositório nem no `.env`.

Se trocar de projeto no Supabase, troque também o host no `connect-src` do `vercel.json` (o teste `tests/vercel-csp.test.ts` acusa se esquecer).

## Banco

O projeto Supabase usado hoje é o mesmo do demo da URBZ. As migrations já estão aplicadas lá; falta só o seed.

```
npx supabase login
npx supabase link --project-ref <ref do projeto>
npx supabase db push --linked --include-seed
```

O seed (`supabase/seed.sql`) grava horários, serviços e barbeiros da Menezes e **desativa** os do demo anterior (não apaga, porque agendamentos antigos apontam para eles). Depois dele, o site antigo da URBZ para de agendar.

Acesso ao painel: o seed coloca na equipe os usuários do Auth com e-mail `painel@menezes.teste` ou `painel@urbz.teste`. Para criar o do dono: Authentication > Users > Add user, some o e-mail na lista do seed e rode de novo. Mantenha o cadastro público desligado (Authentication > Sign In / Providers).

## Onde mexer

| Quero mudar | Arquivo |
|---|---|
| Serviços, preços, barbeiros, horários, contato | `src/data/barbearia.ts` **e** `supabase/seed.sql` (o teste `tests/dados-menezes.test.ts` confere se batem) |
| Cores, fontes, tamanhos | `src/styles/index.css`, bloco `@theme` |
| Topo em camadas (números do movimento) | `src/styles/index.css`, bloco "TOPO EM CAMADAS", e `src/components/secoes/Hero.tsx` |
| Imagens do topo | `public/assets/hero/` (três WebP de 2560x1429, mesmo tamanho) |
| Logo | `public/assets/logo.png` (quadrado, 224x224 ou maior) |
| Seções da página inicial | `src/components/secoes/` e a ordem em `src/pages/Landing.tsx` |

## Fotos

A seção "O espaço" usa só fotos reais do salão. Hoje há uma (`salao`), tirada da página do AppBarber, em baixa resolução. Para trocar ou acrescentar: salve os WebP como `public/assets/fotos/<nome>-<largura>.webp` e registre em `src/data/fotos.gerado.ts`.

As três imagens do topo foram geradas por IA a partir da foto real, só como ilustração. O logo veio do AppBarber. Peça os originais ao dono.

## Publicar na Vercel

Importe o repositório, Framework Preset "Vite", cadastre as duas variáveis `VITE_` e publique. O `vercel.json` já traz o redirecionamento das rotas e os cabeçalhos de segurança.

## Estrutura de pastas

```
public/assets/   logo, camadas do topo e fotos
src/
  pages/         uma página por rota (Landing, Agendar, AgendarSucesso, Painel, NaoEncontrada)
  components/    interface (secoes/ = página inicial, agendar/, painel/)
  data/          dados da barbearia
  hooks/ lib/    código sem interface
  styles/        CSS global e tokens do tema
supabase/        migrations e seed
tests/           Vitest (tests/_fixtures = catálogo de teste das regras)
e2e/             Playwright (herdados da URBZ, por adaptar)
docs/historico-urbz/  relatório do demo original
```

`estudo/` é pessoal do dono do repositório: fica fora do git e da leitura dos agentes.
