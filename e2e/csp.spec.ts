import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Zero violações de CSP nas rotas reais. O preview do Vite não manda os cabeçalhos do vercel.json, então
// este spec os injeta nas respostas de documento com page.route (só aqui; produção e os outros testes
// ficam como estão). A política vem do próprio vercel.json: o que se testa é o que vai ao ar.
// Única diferença: sem `upgrade-insecure-requests`, que reescreveria http://localhost para https.

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const CSP = config.headers
  .find((h) => h.source === '/(.*)')!
  .headers
  .find((h) => h.key === 'Content-Security-Policy')!
  .value.replace(/;\s*upgrade-insecure-requests/, '')

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA

type ComViolacoes = { __csp?: string[] }

/** Registra violações (evento do navegador) e erros de console que falem de CSP. Devolve o leitor. */
async function vigiar(page: Page) {
  const extras: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as ComViolacoes
      ;(w.__csp ??= []).push(`${e.violatedDirective} bloqueou ${e.blockedURI}`)
    })
  })
  page.on('console', (msg) => {
    if (/content security policy|refused to/i.test(msg.text())) extras.push(`console: ${msg.text()}`)
  })
  page.on('pageerror', (e) => extras.push(`pageerror: ${e.message}`))
  await page.route('**/*', async (rota) => {
    if (rota.request().resourceType() !== 'document') return rota.fallback()
    const resposta = await rota.fetch()
    await rota.fulfill({ response: resposta, headers: { ...resposta.headers(), 'content-security-policy': CSP } })
  })
  return async () => {
    const doNavegador = await page.evaluate(() => (window as unknown as ComViolacoes).__csp ?? [])
    return [...doNavegador, ...extras]
  }
}

test.describe('CSP do vercel.json', () => {
  test('a landing (/) roda inteira, rolando até o fim', async ({ page }) => {
    const violacoes = await vigiar(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Rola em passos para disparar as animações ligadas ao scroll (Motion/Lenis) e as imagens preguiçosas.
    const altura = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y <= altura; y += 700) {
      await page.mouse.wheel(0, 700)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(500)
    expect(await violacoes()).toEqual([])
  })

  test('/agendar lista horários do Supabase', async ({ page }) => {
    const violacoes = await vigiar(page)
    const respostas: number[] = []
    page.on('response', (r) => {
      if (r.url().includes('/rest/v1/rpc/horarios_disponiveis')) respostas.push(r.status())
    })
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(
      page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first().or(page.getByText(/Sem horário livre/)),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(respostas).toContain(200) // a chamada ao Supabase passou pelo connect-src
    expect(await violacoes()).toEqual([])
  })

  test('/painel: formulário e login', async ({ page }) => {
    test.skip(!EMAIL || !SENHA, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
    test.setTimeout(60_000)
    const violacoes = await vigiar(page)
    await page.goto('/painel')
    await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible()
    await page.getByLabel('E-mail').fill(EMAIL!)
    await page.getByLabel('Senha').fill(SENHA!)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)
    expect(await violacoes()).toEqual([])
  })

  test('sanidade: a política vale (script inline sem hash é bloqueado)', async ({ page }) => {
    const violacoes = await vigiar(page)
    await page.goto('/agendar')
    await page.evaluate(() => {
      const s = document.createElement('script')
      s.textContent = 'window.__x = 1'
      document.head.appendChild(s)
    })
    await page.waitForTimeout(200)
    expect((await violacoes()).join()).toContain('script-src')
  })
})
