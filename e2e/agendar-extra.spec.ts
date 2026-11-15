import { expect, test, type Page } from '@playwright/test'

// Complementos do agendar.spec.ts: entrada pela landing, botão voltar do navegador,
// corrida entre dias, teclado e rolagem horizontal. A RPC horarios_disponiveis é mockada.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
// 12:00Z, 12:30Z e 17:00Z = 09:00, 09:30 e 14:00 em São Paulo.
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00', '2026-10-14T17:00:00+00:00']

async function mockHorarios(page: Page, horarios: string[] = HORARIOS) {
  await page.route(ROTA_HORARIOS, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(horarios.map((inicio) => ({ inicio }))),
    }),
  )
}

async function semRolagemHorizontal(page: Page) {
  const { html, body, visivel } = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(html).toBeLessThanOrEqual(visivel)
  expect(body).toBeLessThanOrEqual(visivel)
}

async function escolher(page: Page, nome: string | RegExp) {
  await page.locator('label').filter({ has: page.getByRole('radio', { name: nome }) }).click()
}

/** Aperta Tab até o foco cair em algo que bate com o seletor (máx. 40 vezes). */
async function tabAte(page: Page, seletor: string) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, seletor)) return
  }
  throw new Error(`O foco nunca chegou em ${seletor}`)
}

const diasAbertos = 'label:has(input[name="dia"]:not([disabled]))'

test.describe('entrada pelos links da landing', () => {
  test('Agendar do combo 2 abre o passo do barbeiro com o combo marcado', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: 'Agendar Cuidado Completo', exact: true })
    // O post 2 só chega à tela depois de rolar a pilha de combos; focar o link faz essa rolagem (ver Combos.tsx).
    await link.focus()
    await page.waitForTimeout(600)
    await link.click()
    await expect(page).toHaveURL(/\/agendar\?combo=cuidado-completo/)
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page.getByRole('radio', { name: /Cuidado Completo/ })).toBeChecked()
  })

  test('Agendar de um serviço avulso abre o passo do barbeiro com o serviço marcado', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: 'Agendar Barba', exact: true })
    await link.scrollIntoViewIfNeeded()
    await link.click()
    await expect(page).toHaveURL(/\/agendar\?servico=barba/)
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page.getByRole('checkbox', { name: /^Barba/ })).toBeChecked()
  })

  test('Agendar com um barbeiro abre o passo do serviço e guarda o barbeiro', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: /Agendar com Diego/ })
    await link.scrollIntoViewIfNeeded()
    await link.click()
    await expect(page).toHaveURL(/\/agendar\?barbeiro=diego/)
    // Sem serviço ainda: começa no passo 1, botão desabilitado.
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    await escolher(page, /Essencial/)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('radio', { name: /Diego/ })).toBeChecked()
  })
})

test.describe('botão voltar do navegador', () => {
  test('a cada voltar, um passo (começando em /agendar)', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar')
    const continuar = page.getByRole('button', { name: 'Continuar' })
    await escolher(page, /Essencial/)
    await continuar.click()
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await continuar.click()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()

    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked()
    await expect(page).toHaveURL(/\/agendar$/)

    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  })

  test('vindo da landing (?combo), voltar do passo 3 cai no passo 2', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar?combo=essencial')
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  })

  test('escolha de horário sobrevive ao ir e voltar do navegador', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar?combo=essencial')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolher(page, '14:00')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('radio', { name: '14:00' })).toBeChecked()
  })
})

test('trocar rápido de dia não mostra horários do dia anterior', async ({ page }) => {
  // 1ª chamada (dia inicial): lenta, devolve 09:00. 2ª (dia clicado): rápida, devolve 14:00.
  const chamadas: string[] = []
  await page.route(ROTA_HORARIOS, async (rota) => {
    const dia = (rota.request().postDataJSON() as { p_dia: string }).p_dia
    chamadas.push(dia)
    const lenta = chamadas.length === 1
    if (lenta) await new Promise((r) => setTimeout(r, 1500))
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ inicio: lenta ? HORARIOS[0] : HORARIOS[2] }]),
    })
  })
  await page.goto('/agendar?combo=essencial&passo=3')
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await page.locator(diasAbertos).nth(1).click()

  await expect(page.getByRole('radio', { name: '14:00' })).toBeVisible()
  // Espera a resposta lenta (do dia antigo) chegar e confere que ela foi descartada.
  await page.waitForTimeout(1800)
  expect(chamadas).toHaveLength(2)
  expect(chamadas[0]).not.toBe(chamadas[1])
  await expect(page.getByRole('radio', { name: '09:00' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: '14:00' })).toBeVisible()
})

test('trocar de dia limpa o horário escolhido', async ({ page }) => {
  await mockHorarios(page)
  await page.goto('/agendar?combo=essencial&passo=3')
  await escolher(page, '09:30')
  const continuar = page.getByRole('button', { name: 'Continuar' })
  await expect(continuar).toBeEnabled()
  await page.locator(diasAbertos).nth(1).click()
  await expect(continuar).toBeDisabled()
  await expect(page.getByRole('radio', { name: '09:30' })).not.toBeChecked()
})

test('teclado: serviço, barbeiro, dia e horário só com Tab, setas e Espaço', async ({ page }) => {
  await mockHorarios(page)
  await page.goto('/agendar')
  // Na primeira carga o foco não vai para o título; o Tab parte do início da página.
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  const continuar = page.getByRole('button', { name: 'Continuar' })

  // Passo 1: Tab chega no grupo de serviços; Espaço marca o focado; seta muda a escolha.
  await tabAte(page, 'input[name="combo"]')
  await page.keyboard.press('Space')
  await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: /Cuidado Completo/ })).toBeChecked()
  await tabAte(page, 'button')
  await expect(continuar).toBeFocused()
  await page.keyboard.press('Enter')

  // Passo 2: sem preferência já marcado; seta escolhe o próximo barbeiro.
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await tabAte(page, 'input[name="barbeiro"]')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: /Sem preferência/ })).not.toBeChecked()
  await expect(page.locator('input[name="barbeiro"]:checked')).toHaveCount(1)
  await tabAte(page, 'button')
  await expect(continuar).toBeFocused()
  await page.keyboard.press('Enter')

  // Passo 3: dia por seta (pula dias fechados), depois Tab até o horário e Espaço.
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await tabAte(page, 'input[name="dia"]')
  const antes = await page.locator('input[name="dia"]:checked').getAttribute('value')
  await page.keyboard.press('ArrowRight')
  const depois = await page.locator('input[name="dia"]:checked').getAttribute('value')
  expect(depois).not.toBe(antes)
  await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
  await tabAte(page, 'input[name="horario"]')
  await page.keyboard.press('Space')
  await expect(page.getByRole('radio', { name: '09:00' })).toBeChecked()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '09:30' })).toBeChecked()
  await tabAte(page, 'button')
  await expect(continuar).toBeFocused()
  await expect(continuar).toBeEnabled()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
})

test('teclado: o foco fica visível no rádio focado', async ({ page }) => {
  await mockHorarios(page)
  await page.goto('/agendar')
  // Na primeira carga o foco não vai para o título; o Tab parte do início da página.
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  await tabAte(page, 'input[name="combo"]')
  const contorno = await page.evaluate(() => {
    const label = document.activeElement?.closest('label')
    if (!label) return ''
    const estilo = getComputedStyle(label)
    return `${estilo.outlineStyle} ${estilo.outlineWidth}`
  })
  expect(contorno).not.toBe('')
  expect(contorno).not.toMatch(/^none/)
  expect(contorno).not.toMatch(/ 0px$/)
})

test('sem rolagem horizontal em todos os passos', async ({ page }) => {
  await mockHorarios(page)
  await page.goto('/agendar')
  await semRolagemHorizontal(page)
  await escolher(page, /Experiência Premium/)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible()
  await semRolagemHorizontal(page)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
  await semRolagemHorizontal(page)
  await escolher(page, '14:00')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
  await semRolagemHorizontal(page)
})

test('sem rolagem horizontal nos estados carregando, vazio e erro do passo 3', async ({ page }) => {
  await page.route(ROTA_HORARIOS, async (rota) => {
    await new Promise((r) => setTimeout(r, 800))
    await rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/agendar?servico=hidratacao&barbeiro=caio&passo=3')
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await semRolagemHorizontal(page)
  await expect(page.getByText(/Sem horário livre/)).toBeVisible()
  await semRolagemHorizontal(page)

  await page.unroute(ROTA_HORARIOS)
  await page.route(ROTA_HORARIOS, (rota) => rota.abort('failed'))
  await page.getByRole('button', { name: /Próximo dia aberto/ }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await semRolagemHorizontal(page)
})
