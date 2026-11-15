import { expect, test } from '@playwright/test'

// Teste de fumaça: cada rota abre sem erro no console e sem rolagem horizontal.
for (const rota of ['/', '/agendar', '/painel']) {
  test(`rota ${rota} abre limpa`, async ({ page }) => {
    const erros: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') erros.push(msg.text())
    })
    page.on('pageerror', (erro) => erros.push(erro.message))

    await page.goto(rota)
    await expect(page.locator('h1')).toBeVisible()

    const { largura, visivel } = await page.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      visivel: document.documentElement.clientWidth,
    }))
    expect(largura).toBeLessThanOrEqual(visivel)
    expect(erros).toEqual([])
  })
}

test('rota inexistente mostra a página 404', async ({ page }) => {
  await page.goto('/nao-existe')
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
})

test('com reducedMotion "reduce" a landing renderiza o h1', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
})
