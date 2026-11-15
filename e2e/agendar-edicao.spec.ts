import { expect, test, type Page } from '@playwright/test'

// Editar um item da revisão e recarregar a página no meio do fluxo (feedback externo):
// o que a pessoa já preencheu não pode se perder. As RPCs são mockadas com page.route.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const CHAVE_RASCUNHO = 'urbz:agendar-rascunho'

interface CorpoHorarios {
  p_servicos: string[]
  p_dia: string
  p_barbeiro: string | null
}

/**
 * Horários de qualquer dia: 12:00Z e 12:30Z = 09:00 e 09:30 em São Paulo.
 * `livres` decide quais existem para cada pedido (ex.: um serviço mais longo perde o 09:00).
 */
async function mockHorarios(
  page: Page,
  livres: (corpo: CorpoHorarios) => string[] = () => ['12:00', '12:30'],
) {
  await page.route(ROTA_HORARIOS, (rota) => {
    const corpo = rota.request().postDataJSON() as CorpoHorarios
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(livres(corpo).map((h) => ({ inicio: `${corpo.p_dia}T${h}:00+00:00` }))),
    })
  })
}

async function mockCriar(page: Page) {
  const corpos: Record<string, unknown>[] = []
  await page.route(ROTA_CRIAR, (rota) => {
    corpos.push(rota.request().postDataJSON() as Record<string, unknown>)
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          codigo: 'K7M2PX',
          barbeiro_nome: 'Rafael',
          servico_nome: 'Essencial',
          preco_total_centavos: 8000,
          duracao_total_min: 60,
          inicio: '2026-10-14T12:00:00+00:00',
        },
      ]),
    })
  })
  return corpos
}

// Clica no <label> (o que a pessoa realmente toca); o rádio de verdade fica escondido.
async function escolher(page: Page, nome: string | RegExp) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: nome }) })
    .click()
}

/** Quarto dia aberto da lista: sempre no futuro, seja qual for o dia em que o teste roda. */
async function escolherDia(page: Page) {
  await page.locator('label:has(input[name="dia"]:not([disabled]))').nth(3).click()
}

const botaoPrincipal = (page: Page) => page.getByTestId('barra-acao').getByRole('button')

async function preencher(page: Page, nome = 'João Silva', telefone = '11999998888') {
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('WhatsApp').fill(telefone)
}

/** Combo Essencial com o Rafael, 4º dia aberto, 09:00, João Silva: para na revisão. */
async function ateARevisao(page: Page) {
  await page.goto('/agendar?combo=essencial&barbeiro=rafael')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await escolherDia(page)
  await escolher(page, '09:00')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await preencher(page)
  await page.getByRole('button', { name: 'Revisar' }).click()
  await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
}

/** Texto do valor de uma linha da revisão ("Quando", "Serviço"...). */
async function linha(page: Page, rotulo: string) {
  return page.locator('dl > div').filter({ hasText: rotulo }).locator('dd').first().innerText()
}

test.describe('editar a partir da revisão', () => {
  test('serviço: abre preenchido e "Voltar à revisão" mantém barbeiro, horário e dados', async ({
    page,
  }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page)
    await ateARevisao(page)
    const quando = await linha(page, 'Quando')

    await page.getByRole('button', { name: 'Editar serviço' }).click()
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Essencial/ })).toBeChecked() // preenchido
    await escolher(page, /Cuidado Completo/)
    await expect(botaoPrincipal(page)).toHaveText('Voltar à revisão')

    await botaoPrincipal(page).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await expect(page).toHaveURL(/passo=5/)
    expect(await linha(page, 'Serviço')).toMatch(/cuidado completo/i)
    expect(await linha(page, 'Barbeiro')).toMatch(/rafael/i)
    expect(await linha(page, 'Quando')).toBe(quando)
    await expect(page.getByText('João Silva')).toBeVisible()
    await expect(page.getByText('(11) 99999-8888')).toBeVisible()

    await botaoPrincipal(page).click() // Confirmar
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(corpos[0]).toMatchObject({
      p_servicos: ['cuidado-completo'],
      p_barbeiro: 'rafael',
      p_nome: 'João Silva',
      p_telefone: '11999998888',
    })
  })

  test('barbeiro: troca para "sem preferência" e mantém o resto', async ({ page }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page)
    await ateARevisao(page)
    const quando = await linha(page, 'Quando')

    await page.getByRole('button', { name: 'Editar barbeiro' }).click()
    await expect(page.getByRole('radio', { name: /Rafael/ })).toBeChecked()
    await escolher(page, /Sem preferência/)
    await botaoPrincipal(page).click()

    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Barbeiro')).toMatch(/sem preferência/i)
    expect(await linha(page, 'Quando')).toBe(quando)
    await botaoPrincipal(page).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(corpos[0]).toMatchObject({ p_servicos: ['essencial'], p_barbeiro: null })
  })

  test('quando: abre com dia e horário marcados; trocar só a hora volta direto à revisão', async ({
    page,
  }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page)
    await ateARevisao(page)

    await page.getByRole('button', { name: 'Editar quando' }).click()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(page.getByRole('radio', { name: '09:00' })).toBeChecked()
    await escolher(page, '09:30')
    await expect(botaoPrincipal(page)).toHaveText('Voltar à revisão')
    await botaoPrincipal(page).click()

    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Quando')).toMatch(/09:30/)
    expect(await linha(page, 'Serviço')).toMatch(/essencial/i)
    await botaoPrincipal(page).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(String(corpos[0].p_inicio)).toMatch(/T12:30:00/)
    expect(corpos[0]).toMatchObject({ p_servicos: ['essencial'], p_barbeiro: 'rafael' })
  })

  test('dados: abre com nome e WhatsApp, troca o nome e volta à revisão', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    const quando = await linha(page, 'Quando')

    await page.getByRole('button', { name: 'Editar nome' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toHaveValue('João Silva')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 99999-8888')
    await page.getByLabel('Nome').fill('João Pedro')
    await expect(botaoPrincipal(page)).toHaveText('Voltar à revisão')
    await botaoPrincipal(page).click()

    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Nome')).toMatch(/joão pedro/i)
    expect(await linha(page, 'Quando')).toBe(quando)
    expect(await linha(page, 'Serviço')).toMatch(/essencial/i)
  })

  test('horário que não cabe mais: avisa e leva ao passo 3 com o mesmo dia', async ({ page }) => {
    // O Cuidado Completo é mais longo: perde o 09:00 e só tem 09:30.
    await mockHorarios(page, (c) => (c.p_servicos.includes('cuidado-completo') ? ['12:30'] : ['12:00', '12:30']))
    await mockCriar(page)
    await ateARevisao(page)
    const dia = await page.evaluate(
      (k) => (JSON.parse(sessionStorage.getItem(k) ?? '{}') as { estado: { dia: string } }).estado.dia,
      CHAVE_RASCUNHO,
    )

    await page.getByRole('button', { name: 'Editar serviço' }).click()
    await escolher(page, /Cuidado Completo/)
    await botaoPrincipal(page).click()

    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(page.getByTestId('aviso-horario')).toContainText('Esse horário não cabe mais com a nova escolha')
    await expect(page.locator('input[name="dia"]:checked')).toHaveValue(dia) // dia mantido
    await expect(page.getByRole('radio', { name: '09:00' })).toHaveCount(0)
    await expect(botaoPrincipal(page)).toBeDisabled()

    await escolher(page, '09:30')
    await expect(botaoPrincipal(page)).toHaveText('Voltar à revisão')
    await botaoPrincipal(page).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Serviço')).toMatch(/cuidado completo/i)
    expect(await linha(page, 'Quando')).toMatch(/09:30/)
    await expect(page.getByText('João Silva')).toBeVisible()
  })

  test('voltar do navegador na edição leva de volta à revisão com tudo', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    const quando = await linha(page, 'Quando')

    await page.getByRole('button', { name: 'Editar nome' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Quando')).toBe(quando)
    await expect(page.getByText('João Silva')).toBeVisible()
  })

  test('trocou o serviço e voltou pelo navegador: o horário é conferido no passo 3 e continua marcado', async ({
    page,
  }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Editar serviço' }).click()
    await escolher(page, /Cuidado Completo/)
    await page.goBack() // pediu o passo 5, mas o horário ainda não foi conferido: cai no 3

    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(page.getByRole('radio', { name: '09:00' })).toBeChecked()
    await expect(botaoPrincipal(page)).toBeEnabled()
  })

  test('Voltar (botão da tela) na edição também volta à revisão', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Editar barbeiro' }).click()
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
  })
})

test.describe('recarregar no meio do fluxo', () => {
  test('passo 4: escolhas feitas na tela e dados digitados sobrevivem', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar') // sem pré-seleção na URL: tudo abaixo só existe no rascunho
    await escolher(page, /Cuidado Completo/)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolher(page, /Diego/)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolherDia(page)
    await escolher(page, '09:30')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await preencher(page, 'Maria Souza', '11988887777')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 98888-7777')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toHaveValue('Maria Souza')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 98888-7777')

    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByRole('radio', { name: '09:30' })).toBeChecked()
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Diego/ })).toBeChecked()
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByRole('radio', { name: /Cuidado Completo/ })).toBeChecked()
  })

  test('revisão: recarrega, continua na revisão e confirma com os mesmos dados', async ({ page }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page)
    await ateARevisao(page)
    const quando = await linha(page, 'Quando')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    expect(await linha(page, 'Quando')).toBe(quando)
    await expect(page.getByText('João Silva')).toBeVisible()
    await expect(page.getByText('(11) 99999-8888')).toBeVisible()

    await botaoPrincipal(page).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(corpos[0]).toMatchObject({
      p_servicos: ['essencial'],
      p_barbeiro: 'rafael',
      p_nome: 'João Silva',
      p_telefone: '11999998888',
    })
    // Reservou: nenhum dado pessoal do rascunho fica no aparelho.
    expect(await page.evaluate((k) => sessionStorage.getItem(k), CHAVE_RASCUNHO)).toBeNull()
  })

  test('rascunho vencido (mais de 30 min) é ignorado', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    await page.evaluate((k) => {
      const r = JSON.parse(sessionStorage.getItem(k) ?? '{}') as { salvoEm: number }
      r.salvoEm -= 31 * 60 * 1000
      sessionStorage.setItem(k, JSON.stringify(r))
    }, CHAVE_RASCUNHO)

    await page.reload()
    // Sem rascunho, só resta a pré-seleção da URL: o horário e os dados se perderam, cai no passo 3.
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(botaoPrincipal(page)).toBeDisabled()
  })

  test('recarregar não renova a validade: os 30 min contam desde a última alteração', async ({
    page,
  }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    const salvoEm = await page.evaluate((k) => {
      const r = JSON.parse(sessionStorage.getItem(k) ?? '{}') as { salvoEm: number }
      r.salvoEm -= 20 * 60 * 1000
      sessionStorage.setItem(k, JSON.stringify(r))
      return r.salvoEm
    }, CHAVE_RASCUNHO)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    const depois = await page.evaluate(
      (k) => (JSON.parse(sessionStorage.getItem(k) ?? '{}') as { salvoEm: number }).salvoEm,
      CHAVE_RASCUNHO,
    )
    expect(depois).toBe(salvoEm)
  })

  test('o aviso do horário some ao trocar de dia', async ({ page }) => {
    await mockHorarios(page, (c) => (c.p_servicos.includes('cuidado-completo') ? ['12:30'] : ['12:00', '12:30']))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Editar serviço' }).click()
    await escolher(page, /Cuidado Completo/)
    await botaoPrincipal(page).click()
    await expect(page.getByTestId('aviso-horario')).toContainText('não cabe mais')
    await page.locator('label:has(input[name="dia"]:not([disabled]))').nth(4).click()
    await expect(page.getByTestId('aviso-horario')).toHaveText('')
  })

  test('entrar de novo por /agendar (sem ?passo) começa limpo, sem usar o rascunho', async ({
    page,
  }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    await page.goto('/agendar')
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Essencial/ })).not.toBeChecked()
  })

  test('sessionStorage com lixo não quebra a página', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar')
    await page.evaluate((k) => sessionStorage.setItem(k, '{"estado":{"servicos":[1]},'), CHAVE_RASCUNHO)
    await page.goto('/agendar?passo=3')
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
  })
})
