import { test, type Page } from '@playwright/test'

// Captura visual do /agendar para o portão de direção de arte (Fase 3).
// Telas curtas: em vez das 6 posições de scroll, captura a viewport e a página inteira de cada estado.
// RPCs mockadas com page.route: nada é gravado no banco. Não faz asserção: o julgamento é humano.

const PASTA = 'test-results/visual/agendar'
const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const HORARIOS = [
  '2026-10-14T12:00:00+00:00',
  '2026-10-14T12:30:00+00:00',
  '2026-10-14T13:00:00+00:00',
  '2026-10-14T13:30:00+00:00',
  '2026-10-14T17:00:00+00:00',
  '2026-10-14T17:30:00+00:00',
  '2026-10-14T18:00:00+00:00',
  '2026-10-14T20:30:00+00:00',
]
const RESERVA = [
  { codigo: 'K7M2PX', barbeiro_nome: 'Rafael', servico_nome: 'Essencial', preco_total_centavos: 8000, duracao_total_min: 60, inicio: HORARIOS[0] },
]

type ModoHorarios = 'ok' | 'vazio' | 'erro' | 'carregando'

async function mock(page: Page, modo: ModoHorarios) {
  await page.route(ROTA_HORARIOS, async (rota) => {
    if (modo === 'carregando') return // nunca responde: fica no estado de carregamento
    if (modo === 'erro') {
      return rota.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'erro', details: null, hint: null }),
      })
    }
    const lista = modo === 'vazio' ? [] : HORARIOS.map((inicio) => ({ inicio }))
    return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lista) })
  })
  await page.route(ROTA_CRIAR, (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) }),
  )
}

async function foto(page: Page, prefixo: string, nome: string) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${PASTA}/${prefixo}-${nome}-viewport.png` })
  await page.screenshot({ path: `${PASTA}/${prefixo}-${nome}-inteira.png`, fullPage: true })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) {
    await page.screenshot({ path: `${PASTA}/${prefixo}-${nome}-OVERFLOW-X-${overflow}px.png` })
  }
}

const continuar = (page: Page) => page.getByRole('button', { name: 'Continuar' }).click()

async function escolher(page: Page, nome: string | RegExp) {
  await page.locator('label').filter({ has: page.getByRole('radio', { name: nome }) }).click()
}

async function percorrer(page: Page, p: string) {
  // Passo 1 e 2
  await mock(page, 'ok')
  await page.goto('/agendar')
  await page.waitForLoadState('networkidle')
  await foto(page, p, '1-servico')
  await page.goto('/agendar?combo=essencial')
  await foto(page, p, '2-barbeiro')

  // Passo 3: com horários, escolhido
  await continuar(page)
  await page.getByRole('radio', { name: '09:00' }).waitFor({ state: 'attached' })
  await foto(page, p, '3-com-horarios')
  await escolher(page, '09:00')
  await foto(page, p, '3-escolhido')

  // Passo 4: vazio e com erro de validação
  await continuar(page)
  await page.getByRole('heading', { name: 'Seus dados' }).waitFor()
  await foto(page, p, '4-dados-vazio')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await foto(page, p, '4-dados-erro')

  // Passo 5: revisão
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByRole('heading', { name: 'Confere aí' }).waitFor()
  await foto(page, p, '5-revisao')

  // Sucesso
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.getByTestId('codigo').waitFor()
  await foto(page, p, 'sucesso')
}

async function estadosPasso3(page: Page, p: string) {
  for (const modo of ['carregando', 'vazio', 'erro'] as const) {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mock(page, modo)
    await page.goto('/agendar?combo=essencial')
    await continuar(page)
    await foto(page, p, `3-${modo}`)
  }
}

async function sucessoSemReserva(page: Page, p: string) {
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/agendar/sucesso')
  await page.getByRole('heading', { name: 'Nenhuma reserva recente.' }).waitFor()
  await foto(page, p, 'sucesso-sem-reserva')
}

async function tudo(page: Page, p: string) {
  await percorrer(page, p)
  await estadosPasso3(page, p)
  await sucessoSemReserva(page, p)
}

test('captura visual do /agendar', async ({ page, browser }, info) => {
  test.setTimeout(240_000)
  const vp = info.project.name
  await tudo(page, vp)

  const ctx = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    baseURL: info.project.use.baseURL,
    reducedMotion: 'reduce',
    hasTouch: info.project.use.hasTouch,
  })
  const pageRM = await ctx.newPage()
  await tudo(pageRM, `${vp}-reduced`)
  await ctx.close()
})
