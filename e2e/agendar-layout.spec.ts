import { expect, test, type Page } from '@playwright/test'

// Layout do /agendar: a ação de cada passo não pode ficar escondida pela barra fixa de baixo. RPCs mockadas.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'

async function horariosVazios(page: Page) {
  await page.route(ROTA_HORARIOS, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
}

test('passo 3 vazio: "Próximo dia aberto" aparece acima da barra, sem rolar', async ({
  page,
}, info) => {
  // No desktop a grade de dias (5 linhas) empurra a ação para baixo da dobra; é só no celular que importa.
  test.skip(info.project.name !== 'celular', 'vale para o celular (360px)')
  await horariosVazios(page)
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Continuar' }).click()
  const acao = page.getByRole('button', { name: /Próximo dia aberto/ })
  await expect(acao).toBeVisible()
  const barra = page.getByTestId('barra-acao')
  const [a, b] = await Promise.all([acao.boundingBox(), barra.boundingBox()])
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y)
})

test('o conteúdo tem folga embaixo para a barra fixa em todos os passos', async ({ page }) => {
  await horariosVazios(page)
  await page.goto('/agendar')
  const barra = page.getByTestId('barra-acao')
  const altura = (await barra.boundingBox())!.height
  const folga = await page
    .locator('main')
    .evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))
  expect(folga).toBeGreaterThanOrEqual(altura)
})
