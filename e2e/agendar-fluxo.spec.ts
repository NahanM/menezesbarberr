import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { clienteEquipe, temEnvEquipe } from '../tests/integracao/clientes.ts'

// Fluxo /agendar completo (incremento 3 da Fase 3): dados, revisão, confirmação e sucesso.
// As RPCs são mockadas com page.route, exceto no último teste, que fala com o banco remoto de
// verdade e cancela o que criou (sessão da equipe, mudar_status) no afterEach.

const PASTA = 'test-results/visual'
const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'

// 12:00Z e 12:30Z = 09:00 e 09:30 de quarta 14/10/2026 em São Paulo.
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']

const RESERVA = [
  {
    codigo: 'K7M2PX',
    barbeiro_nome: 'Rafael',
    servico_nome: 'Essencial', preco_total_centavos: 8000, duracao_total_min: 60,
    inicio: HORARIOS[0],
  },
]

async function mockHorarios(page: Page) {
  const chamadas = { n: 0 }
  await page.route(ROTA_HORARIOS, (rota) => {
    chamadas.n++
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
    })
  })
  return chamadas
}

/** Mock de criar_agendamento. Guarda o corpo recebido de cada chamada. */
async function mockCriar(page: Page, resposta: { status: number; body: unknown }, atraso = 0) {
  const corpos: Record<string, unknown>[] = []
  await page.route(ROTA_CRIAR, async (rota) => {
    corpos.push(rota.request().postDataJSON() as Record<string, unknown>)
    if (atraso) await new Promise((r) => setTimeout(r, atraso))
    await rota.fulfill({
      status: resposta.status,
      contentType: 'application/json',
      body: JSON.stringify(resposta.body),
    })
  })
  return corpos
}

const erroBanco = (code: string, message: string) => ({
  status: 400,
  body: { code, message, details: null, hint: null },
})

// Clica no <label> (o que a pessoa realmente toca); o rádio de verdade fica escondido.
async function escolher(page: Page, nome: string | RegExp) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: nome }) })
    .click()
}

async function foto(page: Page, info: TestInfo, nome: string) {
  await page.waitForTimeout(700) // espera a transição entre passos e o carimbo
  await page.screenshot({
    path: `${PASTA}/agendar-${info.project.name}-${nome}.png`,
    fullPage: true,
  })
}

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

/** Do começo até o passo 4 (essencial, barbeiro opcional, 09:00 escolhido). */
async function ateOsDados(page: Page, barbeiro: string | null = 'rafael') {
  await page.goto(`/agendar?combo=essencial${barbeiro ? `&barbeiro=${barbeiro}` : ''}`)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await escolher(page, '09:00')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
}

async function preencher(page: Page, nome = 'João Silva', telefone = '11999998888') {
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('WhatsApp').fill(telefone)
}

async function ateARevisao(page: Page, barbeiro: string | null = 'rafael') {
  await ateOsDados(page, barbeiro)
  await preencher(page)
  await page.getByRole('button', { name: 'Revisar' }).click()
  await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
}

test.describe('com RPCs mockadas', () => {
  test('fluxo completo até o sucesso, com a mensagem exata do WhatsApp', async ({ page }, info) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page, { status: 200, body: RESERVA })

    await ateOsDados(page)
    await semRolagemHorizontal(page)
    await foto(page, info, '4-dados-vazio')

    // Máscara enquanto digita.
    await page.getByLabel('WhatsApp').fill('11999998888')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 99999-8888')
    await page.getByLabel('Nome').fill('João Silva')
    await foto(page, info, '4-dados-preenchido')

    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await expect(page.getByText('(11) 99999-8888')).toBeVisible()
    await expect(page.getByText('João Silva')).toBeVisible()
    await expect(page.getByText('R$ 80,00').first()).toBeVisible()
    await semRolagemHorizontal(page)
    await foto(page, info, '5-revisao')

    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { name: /Horário reservado/ })).toBeVisible()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
    await semRolagemHorizontal(page)
    await foto(page, info, 'sucesso')

    // O corpo da RPC: telefone só com dígitos, barbeiro por slug.
    expect(corpos).toHaveLength(1)
    expect(corpos[0]).toMatchObject({
      p_servicos: ['essencial'],
      p_barbeiro: 'rafael',
      p_inicio: HORARIOS[0],
      p_nome: 'João Silva',
      p_telefone: '11999998888',
    })

    // Link do WhatsApp: texto exato do CLAUDE.md, wa.me, nova aba segura.
    const link = page.getByRole('link', { name: 'Confirmar no WhatsApp' })
    const href = (await link.getAttribute('href')) ?? ''
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
    expect(decodeURIComponent(href.split('?text=')[1])).toBe(
      'Olá, pessoal da Menezes! Quero confirmar meu horário: Essencial com Rafael, quarta 14/10 às 09:00. Nome: João Silva. Código: K7M2PX.',
    )
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(page.getByText(/pendente até a barbearia confirmar/)).toBeVisible()

    await expect(page).toHaveURL(/\/agendar\/sucesso$/)

    // Recarregar não perde o código: a reserva vem do sessionStorage.
    await page.reload()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')

    // Voltar não leva de novo ao "Confirmar" (a entrada foi trocada) e nada é reenviado.
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('codigo')).toHaveCount(0)
    expect(corpos).toHaveLength(1)
    await page.goForward()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')

    await page.getByRole('link', { name: 'Voltar ao início' }).click()
    await expect(page).toHaveURL('/')
  })

  test('sucesso sem reserva guardada mostra o aviso e o caminho para agendar', async ({ page }) => {
    await page.goto('/agendar/sucesso')
    await expect(page.getByRole('heading', { name: 'Nenhuma reserva recente.' })).toBeVisible()
    await page.getByRole('link', { name: 'Agendar um horário' }).click()
    await expect(page).toHaveURL(/\/agendar$/)
  })

  test('sem preferência: o barbeiro vai nulo e a revisão explica', async ({ page }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page, { status: 200, body: RESERVA })
    await ateARevisao(page, null)
    await expect(page.getByText('A gente escolhe quem estiver livre.')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(corpos[0].p_barbeiro).toBeNull()
  })

  test('validação inline: nome e WhatsApp vazios', async ({ page }, info) => {
    await mockHorarios(page)
    await ateOsDados(page)
    await page.getByRole('button', { name: 'Revisar' }).click()

    const nome = page.getByLabel('Nome')
    const tel = page.getByLabel('WhatsApp')
    await expect(nome).toHaveAttribute('aria-invalid', 'true')
    await expect(nome).toBeFocused()
    await expect(page.getByText('Erro · Nome com 2 a 60 caracteres.')).toBeVisible()
    await expect(tel).toHaveAttribute('aria-invalid', 'true')
    // O erro está ligado ao campo por aria-describedby.
    expect(await nome.getAttribute('aria-describedby')).toContain('erro-nome')
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await foto(page, info, '4-dados-erro')

    await nome.fill('J')
    await page.getByLabel('WhatsApp').fill('1199')
    await expect(page.getByText('WhatsApp com DDD: (11) 99999-9999.')).toBeVisible()
    await expect(page.getByText('Nome com 2 a 60 caracteres.')).toBeVisible()
  })

  test('editar na revisão volta ao passo e mantém o resto', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Editar nome' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await expect(page.getByLabel('Nome')).toHaveValue('João Silva')
    await expect(page.getByLabel('WhatsApp')).toHaveValue('(11) 99999-8888')
  })

  test('URB07: horário perdido volta ao passo 3, recarrega a lista e desmarca', async ({
    page,
  }, info) => {
    const horarios = await mockHorarios(page)
    await mockCriar(page, erroBanco('URB07', 'Esse horário acabou de ser ocupado.'))
    await ateARevisao(page)
    const antes = horarios.n

    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(page.getByTestId('aviso-horario')).toContainText('Alguém acabou de pegar esse horário')
    await expect(page.getByRole('radio', { name: '09:00' })).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(horarios.n).toBeGreaterThan(antes)
    await foto(page, info, '3-erro-horario-perdido')
  })

  test('URB05 também volta ao passo 3', async ({ page }) => {
    await mockHorarios(page)
    await mockCriar(page, erroBanco('URB05', 'Horário indisponível.'))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(page.getByTestId('aviso-horario')).toContainText('não está mais disponível')
  })

  test('URB04: volta ao passo 4 com o WhatsApp marcado', async ({ page }, info) => {
    await mockHorarios(page)
    await mockCriar(page, erroBanco('URB04', 'Telefone inválido.'))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    const tel = page.getByLabel('WhatsApp')
    await expect(tel).toBeFocused()
    await expect(tel).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('WhatsApp inválido. Use DDD + número.')).toBeVisible()
    await foto(page, info, '4-erro-servidor-telefone')
  })

  test('URB03: volta ao passo 4 com o nome marcado', async ({ page }) => {
    await mockHorarios(page)
    await mockCriar(page, erroBanco('URB03', 'Nome inválido.'))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByLabel('Nome')).toBeFocused()
    await expect(page.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'true')
  })

  test('URB06: mensagem e botão do WhatsApp da barbearia', async ({ page }, info) => {
    await mockHorarios(page)
    await mockCriar(page, erroBanco('URB06', 'Limite de pendentes.'))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    const alerta = page.getByRole('group', { name: /Sem conexão|Algo deu errado|aguardando/ })
    await expect(alerta).toContainText('aguardando confirmação')
    const link = alerta.getByRole('link', { name: 'Chamar no WhatsApp' })
    await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+/)
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await foto(page, info, '5-erro-limite')
  })

  test('erro de rede: mensagem, dados mantidos e tentar de novo funciona', async ({
    page,
  }, info) => {
    await mockHorarios(page)
    await page.route(ROTA_CRIAR, (rota) => rota.abort('failed'))
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('group', { name: /Sem conexão|Algo deu errado|aguardando/ })).toContainText('Sem conexão')
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await foto(page, info, '5-erro-rede')

    await page.unroute(ROTA_CRIAR)
    await mockCriar(page, { status: 200, body: RESERVA })
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
  })

  test('duplo clique em Confirmar envia uma vez só', async ({ page }) => {
    await mockHorarios(page)
    const corpos = await mockCriar(page, { status: 200, body: RESERVA }, 800)
    await ateARevisao(page)
    const botao = page.getByRole('button', { name: 'Confirmar' })
    await botao.dblclick()
    await expect(page.getByRole('button', { name: 'Enviando' })).toBeDisabled()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(corpos).toHaveLength(1)
  })

  test('nome com HTML aparece como texto, sem virar tag', async ({ page }) => {
    await mockHorarios(page)
    await mockCriar(page, { status: 200, body: RESERVA })
    await ateOsDados(page)
    await preencher(page, '<b>Zé</b>')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByText('<b>Zé</b>')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText('<b>Zé</b>')).toBeVisible()
    await expect(page.locator('b')).toHaveCount(0)
  })

  test('com reduced-motion o fluxo e o carimbo aparecem', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockHorarios(page)
    await mockCriar(page, { status: 200, body: RESERVA })
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
  })
})

test.describe('contra o banco real', () => {
  test.skip(!temEnvEquipe, 'precisa de VITE_SUPABASE_*, E2E_EMAIL e E2E_SENHA no .env')

  const criados: string[] = []

  // Cancela o que o teste criou, com a sessão da equipe (cancelado libera a agenda).
  test.afterEach(async () => {
    const equipe = await clienteEquipe()
    for (const codigo of criados.splice(0)) {
      const { data } = await equipe.from('agendamentos').select('id').eq('codigo', codigo).single()
      if (data) await equipe.rpc('mudar_status', { p_id: data.id, p_status: 'cancelado' })
    }
  })

  test('cria um agendamento de verdade e mostra o código do servidor', async ({ page }, info) => {
    await page.goto('/agendar?servico=sobrancelha')
    await page.getByRole('button', { name: 'Continuar' }).click() // passo 2 -> 3

    // Procura o primeiro dia com horário livre (a agenda real muda com o dia em que o teste roda).
    const horario = page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first()
    for (let i = 0; i < 6 && !(await horario.isVisible()); i++) {
      const proximo = page.getByRole('button', { name: /Próximo dia aberto/ })
      await expect(horario.or(proximo)).toBeVisible({ timeout: 15_000 })
      if (await horario.isVisible()) break
      await proximo.click()
    }
    await expect(horario).toBeVisible()
    await page.locator('label:has(input[name="horario"])').first().click()
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Telefone de teste. O servidor limita pendentes por telefone, por isso o afterEach cancela.
    await preencher(page, 'Teste Automatico', '11988880000')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await page.getByRole('button', { name: 'Confirmar' }).click()

    const codigo = page.getByTestId('codigo')
    await expect(codigo).toBeVisible({ timeout: 20_000 })
    const texto = (await codigo.textContent()) ?? ''
    expect(texto).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    criados.push(texto)

    await expect(page.getByRole('link', { name: 'Confirmar no WhatsApp' })).toBeVisible()
    await foto(page, info, 'sucesso-banco-real')
  })
})
