import { expect, test } from '@playwright/test'

// QA S4: o honeypot não desloca o layout do passo 4 (360px e desktop) nem cria rolagem horizontal.
test('remover o honeypot do DOM não muda a posição de nenhum campo nem a altura da página', async ({ page }) => {
  await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ inicio: '2026-10-14T12:00:00+00:00' }]) }),
  )
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('label').filter({ has: page.getByRole('radio', { name: '09:00' }) }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('heading', { name: 'Seus dados' }).waitFor()
  await page.waitForTimeout(800)
  const medir = () =>
    page.evaluate(() => {
      const q = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) }
      return {
        nome: q('input[autocomplete="name"], #nome, input[name="nome"]'),
        form: q('form'),
        altura: document.documentElement.scrollHeight,
        largura: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }
    })
  const com = await medir()
  expect(com.largura).toBeLessThanOrEqual(com.visivel)
  await page.locator('input[name="url_empresa"]').evaluate((el) => el.parentElement!.remove())
  const sem = await medir()
  expect(com).toEqual(sem)
})
