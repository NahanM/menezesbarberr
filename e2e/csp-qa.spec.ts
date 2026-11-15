import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// QA do S1: CSP do vercel.json em 404, sucesso do /agendar (RPCs simuladas) e painel Dia/Semana.
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const CSP = config.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value.replace(/;\s*upgrade-insecure-requests/, '')
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
type W = { __csp?: string[] }

async function vigiar(page: Page) {
  const extras: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;((window as unknown as W).__csp ??= []).push(`${e.violatedDirective} bloqueou ${e.blockedURI}`)
    })
  })
  page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) extras.push(m.text()) })
  page.on('pageerror', (e) => extras.push(e.message))
  await page.route('**/*', async (rota) => {
    if (rota.request().resourceType() !== 'document') return rota.fallback()
    const resp = await rota.fetch()
    await rota.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': CSP } })
  })
  return async () => [...(await page.evaluate(() => (window as unknown as W).__csp ?? [])), ...extras]
}

test('404 de rota sob CSP', async ({ page }) => {
  const v = await vigiar(page)
  await page.goto('/rota-que-nao-existe')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(400)
  expect(await v()).toEqual([])
})

test('/agendar até a tela de sucesso sob CSP', async ({ page }) => {
  const v = await vigiar(page)
  const H = '2026-10-14T12:00:00+00:00'
  await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ inicio: H }]) }))
  await page.route('**/rest/v1/rpc/criar_agendamento*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      codigo: 'K7M2PX', barbeiro_nome: 'Rafael', servico_nome: 'Essencial', preco_total_centavos: 8000, duracao_total_min: 60, inicio: H }]) }))
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('label').filter({ has: page.getByRole('radio', { name: '09:00' }) }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
  await expect(page.getByRole('link', { name: /WhatsApp/ }).first()).toHaveAttribute('href', /wa\.me/)
  await page.waitForTimeout(400)
  expect(await v()).toEqual([])
})

test('/painel logado: Dia e Semana sob CSP', async ({ page }) => {
  test.skip(!EMAIL || !SENHA, 'sem credenciais')
  test.setTimeout(60_000)
  const v = await vigiar(page)
  await page.goto('/painel')
  await page.getByLabel('E-mail').fill(EMAIL!)
  await page.getByLabel('Senha').fill(SENHA!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible({ timeout: 30_000 })
  const grupo = page.getByRole('group').filter({ has: page.getByRole('button', { name: 'Semana' }) })
  await grupo.getByRole('button', { name: 'Semana' }).click()
  await expect(grupo.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(800)
  await grupo.getByRole('button', { name: 'Dia' }).click()
  await expect(grupo.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(500)
  expect(await v()).toEqual([])
})
