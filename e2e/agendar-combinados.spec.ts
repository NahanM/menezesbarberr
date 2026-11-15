import { expect, test, type Page } from '@playwright/test'

// Passo 1 do /agendar com avulsos somados (decisão do dono): vários avulsos OU um combo.
// RPCs mockadas com page.route; nada vai ao banco.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'

// 12:00Z = 09:00 de quarta 14/10/2026 em São Paulo.
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']

async function mocks(page: Page) {
  const horarios: Record<string, unknown>[] = []
  const criar: Record<string, unknown>[] = []
  await page.route(ROTA_HORARIOS, (rota) => {
    horarios.push(rota.request().postDataJSON() as Record<string, unknown>)
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
    })
  })
  await page.route(ROTA_CRIAR, (rota) => {
    criar.push(rota.request().postDataJSON() as Record<string, unknown>)
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          codigo: 'K7M2PX',
          barbeiro_nome: 'Rafael',
          servico_nome: 'Corte + Sobrancelha',
          inicio: HORARIOS[0],
          preco_total_centavos: 6500,
          duracao_total_min: 55,
        },
      ]),
    })
  })
  return { horarios, criar }
}

// Clica no <label> (o que a pessoa realmente toca); o input de verdade fica escondido.
async function marcar(page: Page, papel: 'checkbox' | 'radio', nome: string | RegExp) {
  await page.locator('label').filter({ has: page.getByRole(papel, { name: nome }) }).click()
}

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

test('marcar dois avulsos soma preço e duração na barra', async ({ page }) => {
  await mocks(page)
  await page.goto('/agendar')
  const barra = page.getByTestId('barra-acao')
  await marcar(page, 'checkbox', /^Corte/)
  await expect(barra).toContainText('R$ 50,00')
  await marcar(page, 'checkbox', /^Sobrancelha/)
  await expect(barra).toContainText('Corte + Sobrancelha')
  await expect(barra).toContainText('R$ 65,00')
  await expect(barra).toContainText('2 serviços')
  await expect(barra).toContainText('55 min')
  await semRolagemHorizontal(page)
  // Desmarcar um volta ao valor do outro.
  await marcar(page, 'checkbox', /^Corte/)
  await expect(barra).toContainText('R$ 15,00')
  // Desmarcar o último desabilita o Continuar.
  await marcar(page, 'checkbox', /^Sobrancelha/)
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
})

test('combo e avulso não se misturam: um derruba o outro', async ({ page }) => {
  await mocks(page)
  await page.goto('/agendar')
  await marcar(page, 'checkbox', /^Corte/)
  await marcar(page, 'checkbox', /^Barba/)
  await marcar(page, 'radio', /Essencial/)
  await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /^Corte/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).not.toBeChecked()
  await marcar(page, 'checkbox', /^Barba/)
  await expect(page.getByRole('radio', { name: /Essencial/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).toBeChecked()
})

test('no máximo 5 avulsos: o sexto fica desabilitado até desmarcar um', async ({ page }) => {
  await mocks(page)
  await page.goto('/agendar')
  for (const nome of [/^Corte/, /^Barba/, /^Sobrancelha/, /^Limpeza/, /^Hidratação/]) {
    await marcar(page, 'checkbox', nome)
  }
  await expect(page.getByRole('checkbox', { name: /^Depilação/ })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Limite de 5 atingido' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Corte/ })).toHaveAttribute('aria-describedby', 'ajuda-avulsos')
  await expect(page.locator('#ajuda-avulsos')).toContainText('até 5')
  await marcar(page, 'checkbox', /^Barba/)
  await expect(page.getByRole('checkbox', { name: /^Depilação/ })).toBeEnabled()
  await expect(page.getByText('Limite de 5 atingido')).toHaveCount(0)
})

test('teclado: Espaço marca e desmarca o avulso focado', async ({ page }) => {
  await mocks(page)
  await page.goto('/agendar')
  await page.getByRole('checkbox', { name: /^Corte/ }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox', { name: /^Corte/ })).toBeChecked()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox', { name: /^Corte/ })).not.toBeChecked()
})

test('fluxo com dois avulsos: horários e criação levam os dois slugs; a mensagem usa o nome combinado', async ({
  page,
}) => {
  const { horarios, criar } = await mocks(page)
  await page.goto('/agendar')
  await marcar(page, 'checkbox', /^Sobrancelha/) // clicados fora de ordem...
  await marcar(page, 'checkbox', /^Corte/) // ...o payload sai na ordem do catálogo
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click() // sem preferência
  await marcar(page, 'radio', '09:00')
  expect(horarios.at(-1)).toMatchObject({ p_servicos: ['corte', 'sobrancelha'] })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()

  await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
  await expect(page.getByRole('main').getByText('Corte + Sobrancelha')).toBeVisible()
  await expect(page.getByText('R$ 65,00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar' }).click()

  const link = page.getByRole('link', { name: 'Confirmar no WhatsApp' })
  const href = (await link.getAttribute('href')) ?? ''
  expect(decodeURIComponent(href.split('?text=')[1])).toBe(
    'Olá, pessoal da Menezes! Quero confirmar meu horário: Corte + Sobrancelha com Rafael, quarta 14/10 às 09:00. Nome: João Silva. Código: K7M2PX.',
  )
  expect(criar).toHaveLength(1)
  expect(criar[0]).toMatchObject({ p_servicos: ['corte', 'sobrancelha'] })
  // A tela de sucesso mostra a soma devolvida pelo servidor.
  await expect(page.getByText('R$ 65,00').first()).toBeVisible()
  await expect(page.getByText('55 min').first()).toBeVisible()
})

test('?servico= continua marcando só aquele avulso; dá para somar outro depois', async ({ page }) => {
  await mocks(page)
  await page.goto('/agendar?servico=barba')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).toBeChecked()
  await marcar(page, 'checkbox', /^Corte/)
  await expect(page.getByTestId('barra-acao')).toContainText('Corte + Barba')
})
