import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

// Ajudas dos testes que usam o login REAL do painel (conta da equipe em E2E_EMAIL/E2E_SENHA).
// Não é um arquivo de teste (não termina em .spec.ts).

/** O login e a checagem is_equipe vão ao Supabase de verdade: aqui o prazo é de rede, não de tela. */
export const ESPERA_LOGIN_REAL = 30_000

/**
 * Caminho do arquivo de sessão (storageState) deste worker.
 *
 * Cuidado com o alcance: o playwright.config.ts tem `workers: 1`, então este sufixo só protege a suíte
 * rodada com `--workers` maior que 1 (como a de 3 workers) e não prova, sozinho, a causa de nenhuma falha
 * específica. Com 1 worker o caminho é sempre `-w0` e nada muda.
 *
 * Antes, cada arquivo de teste gravava `test-results/estado-<nome>.json` e vários arquivos dividiam o
 * mesmo caminho (`estado-painel.json`); o projeto celular e o desktop também. Com mais de um worker, um
 * login regravava o arquivo no instante em que outro teste o lia: a leitura podia pegar JSON pela metade
 * (corrida possível, janela pequena). O índice do worker (TEST_PARALLEL_INDEX, único entre os
 * workers vivos) dá a cada um o seu arquivo; o beforeAll do worker o grava antes de qualquer teste ler.
 * Precisa ser chamado na raiz do arquivo, onde o `test.use({ storageState })` também é.
 */
export function estadoDoWorker(nome: string): string {
  return `test-results/estado-${nome}-w${process.env.TEST_PARALLEL_INDEX ?? '0'}.json`
}

/**
 * Entra no /painel com a conta da equipe e guarda a sessão em `arquivo`.
 * Use dentro de um `test.beforeAll`. Dá um prazo de rede real ao hook (o padrão de 30 s inclui o
 * carregamento da página e duas idas ao Supabase).
 */
export async function entrarNoPainel(browser: Browser, baseURL: string | undefined, arquivo: string): Promise<void> {
  test.setTimeout(ESPERA_LOGIN_REAL * 2)
  const contexto = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    const page = await contexto.newPage()
    await page.goto('/painel')
    await page.getByLabel('E-mail').fill(process.env.E2E_EMAIL!)
    await page.getByLabel('Senha').fill(process.env.E2E_SENHA!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible({ timeout: ESPERA_LOGIN_REAL })
    await contexto.storageState({ path: arquivo })
  } finally {
    await contexto.close()
  }
}

/**
 * Relógio simulado (page.clock) pode ficar à frente do `expires_at` da sessão guardada: o supabase-js acha
 * que o token expirou e tenta renová-lo na rede real. Com vários testes usando o mesmo refresh token, a
 * renovação falha e o painel volta ao login (falha que depende da hora do dia e do paralelismo).
 * Esta ajuda estica o `expires_at` guardado antes do app carregar. O que o teste verifica não muda.
 * Chame antes do `page.goto` (e antes de `page.clock.*`, de preferência).
 */
export async function manterSessaoComRelogioSimulado(alvo: Page | BrowserContext): Promise<void> {
  await alvo.addInitScript(() => {
    for (const chave of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(chave)) continue
      const sessao = JSON.parse(localStorage.getItem(chave) ?? 'null')
      if (sessao && typeof sessao === 'object') {
        sessao.expires_at = 4102444800 // 2100-01-01
        localStorage.setItem(chave, JSON.stringify(sessao))
      }
    }
  })
}

/**
 * Responde `is_equipe = true` sem ir ao Supabase.
 *
 * Nos testes de tela do painel a sessão é real (beforeAll), mas a agenda é simulada. Sem isto, cada teste
 * ainda fazia UMA ida de rede ao banco real só para o painel abrir: um soluço de rede (ou 5 s de espera
 * padrão estourados) derrubava vários testes seguidos sem relação com o que eles verificam. A checagem
 * real da equipe continua coberta pelo login do beforeAll (que só termina com o painel aberto) e pelos
 * testes `*-real.spec.ts`, `painel-login*.spec.ts` e a visita somente leitura dos `*-qa`.
 * Onde o `is_equipe` real continua coberto: beforeAll, `*-real`, `painel-login*` e os testes do banco (Vitest).
 */
export async function simularEquipe(page: Page): Promise<void> {
  await page.route('**/rest/v1/rpc/is_equipe*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  )
}
