import { expect, test, type Page, type TestInfo } from '@playwright/test'

// Fluxo /agendar até a escolha do horário (incremento 2 da Fase 3).
// A chamada ao banco (RPC horarios_disponiveis) é interceptada com page.route: assim o teste
// não depende da agenda real nem da hora em que roda. Um teste no final usa o banco de verdade.
// As capturas de tela vão para test-results/visual/ (o Playwright apaga outputDir, mas não essa pasta).

const PASTA = 'test-results/visual'
const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'

// 12:00Z, 12:30Z e 17:00Z = 09:00, 09:30 e 14:00 em São Paulo.
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00', '2026-10-14T17:00:00+00:00']

async function mockHorarios(page: Page, horarios: string[]) {
  await page.route(ROTA_HORARIOS, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(horarios.map((inicio) => ({ inicio }))),
    }),
  )
}

async function foto(page: Page, info: TestInfo, nome: string) {
  await page.waitForTimeout(500) // espera a transição entre passos terminar
  // fullPage: inclui o que está abaixo da dobra (vazio, erro, grade de horários).
  await page.screenshot({ path: `${PASTA}/agendar-${info.project.name}-${nome}.png`, fullPage: true })
}

// Clica no <label> (o que a pessoa realmente toca); o rádio de verdade fica escondido.
async function escolher(page: Page, nome: string | RegExp) {
  await page.locator('label').filter({ has: page.getByRole('radio', { name: nome }) }).click()
}

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

test('fluxo completo até escolher o horário', async ({ page }, info) => {
  await mockHorarios(page, HORARIOS)
  await page.goto('/agendar')

  // Passo 1: nada escolhido, botão desabilitado.
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  const continuar = page.getByRole('button', { name: 'Continuar' })
  await expect(continuar).toBeDisabled()
  await semRolagemHorizontal(page)
  await foto(page, info, '1-servico')

  await escolher(page, /Cuidado Completo/)
  await expect(continuar).toBeEnabled()
  await continuar.click()

  // Passo 2: "Sem preferência" já vem marcado.
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Sem preferência/ })).toBeChecked()
  await semRolagemHorizontal(page)
  await foto(page, info, '2-barbeiro')
  await escolher(page, /Diego/)
  await continuar.click()

  // Passo 3: horários mockados.
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '09:30' })).toBeVisible()
  await expect(continuar).toBeDisabled()
  await semRolagemHorizontal(page)
  await foto(page, info, '3-dia-hora')

  await escolher(page, '14:00')
  await expect(continuar).toBeEnabled()
  await foto(page, info, '3-dia-hora-escolhido')

  // Voltar do navegador volta um passo e mantém as escolhas.
  await continuar.click()
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '14:00' })).toBeChecked()
})

test('?combo e ?barbeiro pulam para o passo do barbeiro com tudo marcado', async ({ page }) => {
  await mockHorarios(page, HORARIOS)
  await page.goto('/agendar?combo=essencial&barbeiro=caio')
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Caio/ })).toBeChecked()
  // Dá para voltar e trocar o serviço.
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked()
})

test('combo vence servico e valores inválidos são ignorados', async ({ page }) => {
  await page.goto('/agendar?combo=essencial&servico=barba&barbeiro=inexistente')
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('radio', { name: /Sem preferência/ })).toBeChecked()
})

test('?passo=3 sem escolhas volta ao passo 1', async ({ page }) => {
  await page.goto('/agendar?passo=3')
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
})

test('estado de carregamento mostra o esqueleto de listras', async ({ page }, info) => {
  await page.route(ROTA_HORARIOS, async (rota) => {
    await new Promise((r) => setTimeout(r, 2500))
    await rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/agendar?combo=essencial&passo=3')
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await foto(page, info, '3-carregando')
})

test('estado vazio oferece o próximo dia aberto', async ({ page }, info) => {
  await mockHorarios(page, [])
  await page.goto('/agendar?combo=essencial&barbeiro=rafael&passo=3')
  await expect(
    page.getByText('Sem horário livre nesse dia. Tenta outro dia ou outro barbeiro.'),
  ).toBeVisible()
  await semRolagemHorizontal(page)
  await foto(page, info, '3-vazio')

  // Responde com horários só depois do clique no atalho.
  await mockHorarios(page, HORARIOS)
  await page.getByRole('button', { name: /Próximo dia aberto/ }).click()
  await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
})

test('erro do servidor mostra a mensagem e tenta de novo', async ({ page }, info) => {
  await page.route(ROTA_HORARIOS, (rota) =>
    rota.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'URB01', message: 'Serviço não encontrado.', details: null, hint: null }),
    }),
  )
  await page.goto('/agendar?combo=essencial&passo=3')
  const alerta = page.getByRole('alert')
  await expect(alerta).toContainText('Esse serviço saiu da lista')
  await foto(page, info, '3-erro-servidor')

  await expect(alerta.getByRole('button', { name: 'Escolher de novo' })).toBeVisible()
  await alerta.getByRole('button', { name: 'Escolher de novo' }).click()
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
})

test('erro de rede mostra mensagem e recarrega ao tentar de novo', async ({ page }, info) => {
  await page.route(ROTA_HORARIOS, (rota) => rota.abort('failed'))
  await page.goto('/agendar?combo=essencial&passo=3')
  await expect(page.getByRole('alert')).toContainText('Sem conexão')
  await foto(page, info, '3-erro-rede')

  await page.unroute(ROTA_HORARIOS)
  await mockHorarios(page, HORARIOS)
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
})

test('com reduced-motion o conteúdo aparece e o fluxo funciona', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockHorarios(page, HORARIOS)
  await page.goto('/agendar?combo=essencial')
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
})

test('logo leva de volta à landing', async ({ page }) => {
  await page.goto('/agendar')
  await page.getByRole('link', { name: /voltar ao site/i }).click()
  await expect(page).toHaveURL('/')
})

test('com o banco real: aparecem horários ou o estado vazio, nunca erro', async ({ page }, info) => {
  await page.goto('/agendar?combo=essencial&passo=3')
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await expect(
    page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first().or(page.getByText(/Sem horário livre/)),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await foto(page, info, '3-banco-real')
})

test('o botão Voltar da tela não empilha histórico', async ({ page }) => {
  await page.goto('/')
  await page.goto('/agendar')
  await escolher(page, /Essencial/)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  // O voltar do navegador sai do fluxo (vai para a landing), em vez de reabrir o passo 2.
  await page.goBack()
  await expect(page).toHaveURL('/')
})

test('abrindo direto no passo 2, o Voltar da tela troca a entrada (sem empilhar)', async ({ page }) => {
  await page.goto('/')
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/')
})
