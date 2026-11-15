import { expect, test, type Page } from '@playwright/test'
import { clienteEquipe, temEnvEquipe } from '../tests/integracao/clientes.ts'

// QA do incremento 3 da Fase 3: fluxo real da landing ao sucesso, teclado e leitor de tela.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']
const RESERVA = [
  { codigo: 'K7M2PX', barbeiro_nome: 'Rafael', servico_nome: 'Essencial', preco_total_centavos: 8000, duracao_total_min: 60, inicio: HORARIOS[0] },
]

async function mocks(page: Page) {
  await page.route(ROTA_HORARIOS, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
    }),
  )
  await page.route(ROTA_CRIAR, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) }),
  )
}

async function escolherPrimeiroHorario(page: Page) {
  await page.locator('label:has(input[name="horario"])').first().click()
}

async function ateOsDados(page: Page) {
  await page.goto('/agendar?combo=essencial&barbeiro=rafael')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await escolherPrimeiroHorario(page)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
}

const periodo = () => ({
  p_de: new Date().toISOString().slice(0, 10),
  p_ate: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
})

test.describe('teclado e leitor de tela (RPCs mockadas)', () => {
  test('passos 4 e 5 e o sucesso funcionam só com o teclado', async ({ page }) => {
    await mocks(page)
    await ateOsDados(page)
    // Ao trocar de passo o foco vai para o título (leitor de tela anuncia o passo).
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeFocused()

    const nome = page.getByLabel('Nome')
    const tel = page.getByLabel('WhatsApp')
    await page.keyboard.press('Tab')
    if (!(await nome.evaluate((el) => el === document.activeElement))) {
      await expect(page.getByRole('button', { name: 'Voltar' })).toBeFocused()
      await page.keyboard.press('Tab')
    }
    await expect(nome).toBeFocused()
    await page.keyboard.type('Maria Souza')
    await page.keyboard.press('Tab')
    await expect(tel).toBeFocused()
    await page.keyboard.type('11999998888')
    await expect(tel).toHaveValue('(11) 99999-8888')
    await page.keyboard.press('Enter') // Enter no campo envia o formulário

    const titulo5 = page.getByRole('heading', { name: 'Confere aí' })
    await expect(titulo5).toBeVisible()
    await expect(titulo5).toBeFocused()

    // Os cinco "Editar" têm nome acessível distinto.
    const editar = page.getByRole('button', { name: /^Editar / })
    await expect(editar).toHaveCount(5)
    const nomes = await editar.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    expect(new Set(nomes).size).toBe(5)

    // Tab até Confirmar (sem armadilha de foco) e Enter confirma.
    const confirmar = page.getByRole('button', { name: 'Confirmar', exact: true })
    let achou = false
    for (let i = 0; i < 15 && !achou; i++) {
      await page.keyboard.press('Tab')
      achou = await confirmar.evaluate((el) => el === document.activeElement)
    }
    expect(achou, 'Confirmar não é alcançável por Tab').toBe(true)
    await page.keyboard.press('Enter')

    const sucesso = page.getByRole('heading', { name: /Horário reservado/ })
    await expect(sucesso).toBeVisible()
    await expect(sucesso).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Confirmar no WhatsApp' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Voltar ao início' })).toBeFocused()
  })

  test('Editar pelo teclado volta ao passo certo e mantém os dados', async ({ page }) => {
    await mocks(page)
    await ateOsDados(page)
    await page.getByLabel('Nome').fill('Maria Souza')
    await page.getByLabel('WhatsApp').fill('11999998888')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await page.getByRole('button', { name: 'Editar whatsapp' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 99999-8888')
  })

  test('erros têm aria-invalid e aria-describedby apontando para o texto do erro', async ({
    page,
  }) => {
    await mocks(page)
    await ateOsDados(page)

    const nome = page.getByLabel('Nome')
    const tel = page.getByLabel('WhatsApp')
    await expect(nome).toHaveAttribute('aria-invalid', 'false')
    expect((await nome.getAttribute('aria-describedby')) ?? '').not.toContain('erro')

    await page.getByRole('button', { name: 'Revisar' }).click()
    for (const campo of [nome, tel]) {
      await expect(campo).toHaveAttribute('aria-invalid', 'true')
      const ids = ((await campo.getAttribute('aria-describedby')) ?? '').split(/\s+/)
      const erroId = ids.find((i) => i.startsWith('erro-'))
      expect(erroId, 'aria-describedby sem id de erro').toBeTruthy()
      // Todo id referenciado existe no DOM (referência quebrada deixa o leitor de tela mudo).
      for (const id of ids) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1)
      await expect(page.locator(`[id="${erroId}"]`)).not.toBeEmpty()
    }
    await expect(page.locator('#erro-nome')).toHaveText('Erro · Nome com 2 a 60 caracteres.')
    await expect(page.locator('#erro-telefone')).toHaveText('Erro · WhatsApp com DDD: (11) 99999-9999.')
    expect(await tel.getAttribute('aria-describedby')).toContain('dica-telefone')

    // Corrigindo, o aria-invalid volta a false e a referência ao erro some.
    await nome.fill('Maria')
    await tel.fill('11999998888')
    await expect(nome).toHaveAttribute('aria-invalid', 'false')
    await expect(tel).toHaveAttribute('aria-invalid', 'false')
    expect((await nome.getAttribute('aria-describedby')) ?? '').not.toContain('erro')
    await expect(page.locator('#erro-nome')).toHaveCount(0)
  })

  test('nome só de invisíveis é recusado na tela; WhatsApp colado com +55 é limpo', async ({
    page,
  }) => {
    await mocks(page)
    await ateOsDados(page)
    await page.getByLabel('Nome').fill('​​​​')
    await page.getByLabel('WhatsApp').fill('+55 11 99999-8888')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 99999-8888')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
  })
})

test.describe('fluxo real contra o banco, da landing ao sucesso', () => {
  test.skip(!temEnvEquipe, 'precisa de VITE_SUPABASE_*, E2E_EMAIL e E2E_SENHA no .env')
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, 'só no celular (360px)')

  const criados: string[] = []

  test.afterEach(async () => {
    if (criados.length === 0) return
    const equipe = await clienteEquipe()
    const { data } = await equipe.rpc('listar_agenda', periodo())
    for (const codigo of criados.splice(0)) {
      const linha = (data ?? []).find((a: { codigo: string }) => a.codigo === codigo)
      if (linha) await equipe.rpc('mudar_status', { p_id: linha.id, p_status: 'cancelado' })
    }
  })

  test('Agendar do combo na landing até o sucesso; o código existe na agenda com dados canônicos', async ({
    page,
  }) => {
    await page.goto('/')
    const post = page.locator('#combos article[aria-label^="Combo"]').first()
    await post.scrollIntoViewIfNeeded()
    await post.getByRole('link', { name: /Agendar/ }).click()
    await expect(page).toHaveURL(/\/agendar\?combo=essencial/)

    await page.getByRole('button', { name: 'Continuar' }).click() // barbeiro: sem preferência
    const horario = page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first()
    for (let i = 0; i < 8 && !(await horario.isVisible()); i++) {
      const proximo = page.getByRole('button', { name: /Próximo dia aberto/ })
      await expect(horario.or(proximo)).toBeVisible({ timeout: 15_000 })
      if (await horario.isVisible()) break
      await proximo.click()
    }
    await expect(horario).toBeVisible()
    await escolherPrimeiroHorario(page)
    await page.getByRole('button', { name: 'Continuar' }).click()

    await page.getByLabel('Nome').fill('  QA   Ponta​ a Ponta ')
    await page.getByLabel('WhatsApp').fill('+55 11 97777-0001')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByText('QA Ponta a Ponta')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()

    const el = page.getByTestId('codigo')
    await expect(el).toBeVisible({ timeout: 20_000 })
    const codigo = ((await el.textContent()) ?? '').trim()
    expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    criados.push(codigo)

    const equipe = await clienteEquipe()
    const { data, error } = await equipe.rpc('listar_agenda', periodo())
    expect(error).toBeNull()
    const linha = (data ?? []).find((a: { codigo: string }) => a.codigo === codigo)
    expect(linha, `código ${codigo} não está em listar_agenda`).toBeTruthy()
    expect(linha).toMatchObject({
      status: 'pendente',
      servico_nome: 'Essencial',
      cliente_nome: 'QA Ponta a Ponta',
      cliente_telefone: '5511977770001',
    })
    // O barbeiro mostrado na tela é o que o servidor gravou.
    await expect(page.getByText(linha.barbeiro_nome as string).first()).toBeVisible()
  })
})
