import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// Resumo no topo do painel (F8): atendimentos, pendentes e confirmados, no Dia e na Semana.
// Login REAL com a conta da equipe (E2E_EMAIL/E2E_SENHA); a agenda é SIMULADA com page.route. Nada vai ao banco.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-resumo')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

// Semana de segunda 02/11 a domingo 08/11/2026; quarta 04/11 é o dia da URL.
const DIA = '2026-11-04'
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B3, nome: 'Caio' },
]
const NOME: Record<string, string> = { [B1]: 'Rafael', [B3]: 'Caio' }
const sp = (dia: string, hhmm: string) => `${dia}T${hhmm}:00-03:00`

let contador = 0
function ag(barbeiro: string, dia: string, hhmm: string, status: string, cliente = 'Cliente') {
  contador++
  const inicio = sp(dia, hhmm)
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `R${String(contador).padStart(5, '0')}`,
    status,
    inicio,
    fim: inicio.replace(/T(\d\d):(\d\d)/, (_, h: string, m: string) => `T${h}:${String((Number(m) + 1) % 60).padStart(2, '0')}`),
    barbeiro_id: barbeiro,
    barbeiro_nome: NOME[barbeiro],
    servico_nome: 'Corte',
    servico_tipo: 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}

const AGENDA = [
  // terça 03: 2 ativos (1 confirmado, 1 pendente)
  ag(B1, '2026-11-03', '09:00', 'confirmado'),
  ag(B3, '2026-11-03', '11:00', 'pendente', 'Pendente de Terca'),
  // quarta 04: 3 agendados (cancelado e não compareceu não contam); 2 pendentes, 1 confirmado
  ag(B1, '2026-11-04', '15:00', 'pendente', 'Pendente Tarde'),
  ag(B3, '2026-11-04', '10:00', 'pendente', 'Pendente Cedo'),
  ag(B1, '2026-11-04', '11:00', 'cancelado'),
  ag(B1, '2026-11-04', '12:00', 'nao_compareceu'),
  ag(B3, '2026-11-04', '14:00', 'confirmado'),
  // sexta 06
  ag(B1, '2026-11-06', '10:00', 'concluido'),
]
// Semana: 6 atendimentos, 3 pendentes, 2 confirmados. Primeiro pendente: terça 03/11.

interface Opcoes {
  agenda?: (de: string, ate: string) => unknown[]
  atraso?: number
  falhar?: boolean
}

const doPeriodo = (de: string, ate: string) =>
  AGENDA.filter((a) => a.inicio.slice(0, 10) >= de && a.inicio.slice(0, 10) <= ate)

async function simular(page: Page, { agenda = doPeriodo, atraso = 0, falhar = false }: Opcoes = {}) {
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => rota.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', async (rota) => {
    const { p_de, p_ate } = rota.request().postDataJSON() as { p_de: string; p_ate: string }
    if (atraso > 0) await new Promise((r) => setTimeout(r, atraso))
    if (falhar) return rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
    return rota.fulfill(json(agenda(p_de, p_ate)))
  })
}

const resumoDia = (page: Page) => page.getByRole('region', { name: 'Resumo do dia' })
const resumoSemana = (page: Page) => page.getByRole('region', { name: 'Resumo da semana' })

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

test.describe('resumo do dia', () => {
  test('mostra agendados (sem cancelados nem faltas), pendentes e confirmados, entre a navegação e a grade', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    const resumo = resumoDia(page)
    await expect(resumo).toContainText('3 agendados')
    await expect(resumo.getByRole('button', { name: /^2 pendentes/ })).toBeVisible()
    await expect(resumo).toContainText('1 confirmado')

    // Ordem na página: título do dia, resumo, grade (abas no celular, colunas no desktop).
    const topo = await page.getByRole('heading', { level: 1 }).boundingBox()
    const caixa = await resumo.boundingBox()
    const grade = await page.getByRole('region', { name: 'Agenda de Rafael' }).or(page.getByRole('tablist', { name: 'Barbeiros' })).first().boundingBox()
    expect(caixa!.y).toBeGreaterThan(topo!.y)
    expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(grade!.y)
    await semRolagemHorizontal(page)
  })

  test('tocar em pendentes abre o pendente que começa primeiro', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await resumoDia(page).getByRole('button', { name: /^2 pendentes/ }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await expect(dialogo).toContainText('Pendente Cedo')
  })

  test('sem pendentes: o número aparece, mas não é botão', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B1, DIA, '10:00', 'confirmado')] })
    await page.goto(`/painel?dia=${DIA}`)
    const resumo = resumoDia(page)
    await expect(resumo).toContainText('0 pendentes')
    await expect(resumo.getByRole('button')).toHaveCount(0)
  })

  test('carregando: só traços (nenhum número falso) e escondido do leitor de tela', async ({ page }) => {
    await simular(page, { atraso: 1500 })
    await page.goto(`/painel?dia=${DIA}`)
    const carregando = page.locator('section[aria-label="Resumo do dia"]')
    await expect(carregando).toHaveAttribute('aria-hidden', 'true')
    await expect(carregando).not.toContainText(/\d/)
    await expect(resumoDia(page)).toContainText('3 agendados')
  })

  test('erro: o resumo não aparece', async ({ page }) => {
    await simular(page, { falhar: true })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('alert')).toContainText('Não deu para carregar a agenda')
    await expect(page.locator('section[aria-label="Resumo do dia"]')).toHaveCount(0)
  })
})

test.describe('resumo da semana', () => {
  test('soma os dias da semana (sem cancelados)', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    const resumo = resumoSemana(page)
    await expect(resumo).toContainText('6 agendados')
    await expect(resumo.getByRole('link', { name: /^3 pendentes/ })).toBeVisible()
    await expect(resumo).toContainText('2 confirmados')
    await semRolagemHorizontal(page)
  })

  test('tocar em pendentes leva ao primeiro dia com pendente', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await resumoSemana(page).getByRole('link', { name: /^3 pendentes/ }).click()
    await expect(page).toHaveURL(/[?&]dia=2026-11-03$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
    await expect(resumoDia(page)).toContainText('2 agendados')
  })
})

test.describe('altura do resumo', () => {
  test('desktop: uma linha só, abaixo de 90px em 1280px', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'só no desktop')
    await page.setViewportSize({ width: 1280, height: 800 })
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(resumoDia(page)).toContainText('3 agendados')
    const caixa = await resumoDia(page).boundingBox()
    expect(caixa!.height).toBeGreaterThanOrEqual(56)
    expect(caixa!.height).toBeLessThan(90)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(resumoSemana(page)).toContainText('6 agendados')
    expect((await resumoSemana(page).boundingBox())!.height).toBeLessThan(90)
  })
})

test.describe('soma dos cartões', () => {
  test('semana: a soma dos atendimentos dos cartões é igual ao número do resumo (falta fora)', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(resumoSemana(page)).toContainText('6 agendados')
    const nomes = await page.getByRole('list', { name: 'Dias da semana' }).getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
    const soma = nomes.reduce((s, n) => s + Number(/(\d+) atendimentos?/.exec(n)?.[1] ?? 0), 0)
    expect(soma).toBe(6)
  })
})

// ---------------------------------------------------------------
// Bordas (QA F8)
// ---------------------------------------------------------------
async function simularMutavel(page: Page, linhas: ReturnType<typeof ag>[]) {
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => r.fulfill(json(linhas)))
  await page.route('**/rest/v1/rpc/mudar_status*', (r) => {
    const { p_id, p_status } = r.request().postDataJSON() as { p_id: string; p_status: string }
    const l = linhas.find((x) => x.id === p_id)!
    l.status = p_status
    return r.fulfill(json([l]))
  })
}

test.describe('bordas do resumo', () => {
  test('dia só com cancelados: zeros, sem botão', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B1, DIA, '10:00', 'cancelado', 'Cancelado Um'), ag(B3, DIA, '11:00', 'cancelado', 'Cancelado Dois')] })
    await page.goto(`/painel?dia=${DIA}`)
    const resumo = resumoDia(page)
    await expect(resumo).toContainText('0 agendados')
    await expect(resumo).toContainText('0 pendentes')
    await expect(resumo).toContainText('0 confirmados')
    await expect(resumo.getByRole('button')).toHaveCount(0)
    await semRolagemHorizontal(page)
  })

  test('dia só com não compareceu: 0 agendados e o bloco continua na grade', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B1, DIA, '10:00', 'nao_compareceu', 'Faltou Fulano')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(resumoDia(page)).toContainText('0 agendados')
    await expect(page.getByRole('button', { name: /Faltou Fulano/ }).first()).toBeAttached()
  })

  test('concluído conta como agendado', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B1, DIA, '10:00', 'concluido')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(resumoDia(page)).toContainText('1 agendado')
    await expect(resumoDia(page)).toContainText('0 confirmados')
  })

  test('semana com pendente só no domingo: o atalho leva a domingo', async ({ page }) => {
    const todos = [ag(B1, '2026-11-08', '10:00', 'pendente', 'Pendente Domingo'), ag(B1, '2026-11-02', '10:00', 'confirmado')]
    await simular(page, { agenda: (de, ate) => todos.filter((a) => a.inicio.slice(0, 10) >= de && a.inicio.slice(0, 10) <= ate) })
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    const link = resumoSemana(page).getByRole('link', { name: /^1 pendente\./ })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/[?&]dia=2026-11-08$/)
    await expect(resumoDia(page)).toContainText('1 pendente')
  })

  test('semana só com cancelados: zeros e sem link', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B1, DIA, '10:00', 'cancelado')] })
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(resumoSemana(page)).toContainText('0 agendados')
    await expect(resumoSemana(page).getByRole('link')).toHaveCount(0)
  })

  test('atalho depois de confirmar: número cai, atalho passa ao seguinte, no último some', async ({ page }) => {
    await simularMutavel(page, [ag(B3, DIA, '10:00', 'pendente', 'Pendente Cedo'), ag(B1, DIA, '15:00', 'pendente', 'Pendente Tarde')])
    await page.goto(`/painel?dia=${DIA}`)
    const resumo = resumoDia(page)
    await resumo.getByRole('button', { name: /^2 pendentes/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Pendente Cedo')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(resumo).toContainText('1 confirmado')
    await expect(resumo).toContainText('2 agendados')
    const um = resumo.getByRole('button', { name: /^1 pendente\./ })
    await expect(um).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await um.click()
    await expect(page.getByRole('dialog')).toContainText('Pendente Tarde')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(resumo).toContainText('0 pendentes')
    await expect(resumo).toContainText('2 confirmados')
    await expect(resumo.getByRole('button')).toHaveCount(0)
  })

  test('cancelar um pendente tira dos agendados e dos pendentes', async ({ page }) => {
    await simularMutavel(page, [ag(B3, DIA, '10:00', 'pendente', 'Pendente Cedo'), ag(B1, DIA, '15:00', 'confirmado')])
    await page.goto(`/painel?dia=${DIA}`)
    const resumo = resumoDia(page)
    await resumo.getByRole('button', { name: /^1 pendente\./ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar agendamento' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar cancelamento?' }).click()
    await expect(resumo).toContainText('1 agendado')
    await expect(resumo).toContainText('0 pendentes')
  })

  test('360px: sem rolagem horizontal com 99 agendados no Dia e na Semana', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    const muitos = Array.from({ length: 99 }, (_, i) =>
      ag(i % 2 ? B1 : B3, DIA, `${String(9 + Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}`, i % 3 === 0 ? 'pendente' : 'confirmado'))
    await simular(page, { agenda: () => muitos })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(resumoDia(page)).toContainText('99 agendados')
    await semRolagemHorizontal(page)
    expect((await resumoDia(page).boundingBox())!.width).toBeLessThanOrEqual(360)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(resumoSemana(page)).toContainText('99 agendados')
    await semRolagemHorizontal(page)
  })

  for (const visao of ['dia', 'semana'] as const) {
    test(`foco visível no atalho (${visao}): Tab alcança, contorno visível, Enter ativa`, async ({ page }) => {
      await simular(page)
      await page.goto(visao === 'dia' ? `/painel?dia=${DIA}` : `/painel?visao=semana&dia=${DIA}`)
      const atalho = page.locator('section[aria-label^="Resumo"]').getByRole(visao === 'dia' ? 'button' : 'link', { name: /pendentes/ })
      await expect(atalho).toBeVisible()
      let achou = false
      for (let i = 0; i < 30 && !achou; i++) {
        await page.keyboard.press('Tab')
        achou = await atalho.evaluate((el) => el === document.activeElement)
      }
      expect(achou, 'Tab alcança o atalho').toBe(true)
      const o = await atalho.evaluate((el) => {
        const s = getComputedStyle(el)
        return { estilo: s.outlineStyle, largura: parseFloat(s.outlineWidth), cor: s.outlineColor, off: parseFloat(s.outlineOffset), focoVisivel: el.matches(':focus-visible') }
      })
      expect(o.focoVisivel).toBe(true)
      expect(o.estilo).not.toBe('none')
      expect(o.largura).toBeGreaterThanOrEqual(2)
      expect(o.cor).not.toBe('rgba(0, 0, 0, 0)')
      await page.keyboard.press('Enter')
      if (visao === 'semana') await expect(page).toHaveURL(/dia=2026-11-03$/)
      else await expect(page.getByRole('dialog')).toBeVisible()
    })
  }
})
