import { expect, test, type Locator, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// QA do incremento 4.2 (agenda do dia). Dados simulados com page.route (nada é criado no remoto),
// exceto o último bloco, que faz uma visita REAL somente leitura com a conta do .env.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-qa')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const DIA = '2026-11-04' // quarta
const id = (p: number, i: number) => `${p}0000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const BARB = (i: number, nome: string) => ({ id: id(0, i), nome })
const B = [BARB(1, 'Rafael'), BARB(2, 'Diego'), BARB(3, 'Caio')]
const sp = (hhmm: string, dia = DIA) => `${dia}T${hhmm}:00-03:00`
let c = 0
function ag(b: { id: string; nome: string }, de: string, ate: string, status: string, cliente: string, dia = DIA, ateDia = dia) {
  c++
  return {
    id: id(1, c), codigo: `Q${c}`, status, inicio: sp(de, dia), fim: sp(ate, ateDia),
    barbeiro_id: b.id, barbeiro_nome: b.nome, servico_nome: 'Corte', servico_tipo: 'avulso',
    cliente_nome: cliente, cliente_telefone: '11999990000',
  }
}

interface Op {
  barbeiros?: unknown[] | 'erro500' | 'abortar'
  agenda?: (dia: string) => unknown[]
  bloqueios?: (dia: string) => unknown[]
}
async function simular(page: Page, op: Op = {}) {
  const pedidos: string[] = []
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => {
    if (op.barbeiros === 'erro500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' })
    if (op.barbeiros === 'abortar') return r.abort('connectionreset')
    return r.fulfill(json(op.barbeiros ?? B))
  })
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json((op.bloqueios ?? (() => []))((r.request().postDataJSON() as { p_de: string }).p_de))))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => {
    const { p_de } = r.request().postDataJSON() as { p_de: string }
    pedidos.push(p_de)
    return r.fulfill(json((op.agenda ?? (() => []))(p_de)))
  })
  return pedidos
}

const ehCelular = () => test.info().project.name === 'celular'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const secao = (page: Page, nome: string) =>
  ehCelular() ? page.getByRole('tabpanel', { name: new RegExp(`^${nome},`) }) : page.getByRole('region', { name: `Agenda de ${nome}` })
const bloco = (onde: Page | Locator, nome: RegExp | string) => onde.getByRole('button', { name: nome })

async function semRolagemHorizontal(page: Page) {
  const r = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(r.l).toBeLessThanOrEqual(r.v)
}
/** Nenhum elemento do <main> vaza para fora da largura da janela. */
async function nadaVaza(page: Page) {
  const vazando = await page.evaluate(() => {
    const v = document.documentElement.clientWidth
    return [...document.querySelectorAll('main *')]
      .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > v + 1)
      .filter((e) => !e.closest('[role="tablist"]'))
      // Texto cortado por um ancestral overflow:hidden (truncate) está contido, não vaza.
      .filter((e) => {
        for (let a = e.parentElement; a && a.tagName !== 'MAIN'; a = a.parentElement) {
          if (getComputedStyle(a).overflowX === 'hidden' && a.getBoundingClientRect().right <= v + 1) return false
        }
        return true
      })
      .map((e) => e.tagName + '.' + String(e.className).slice(0, 40))
  })
  expect(vazando).toEqual([])
}

// ---------------------------------------------------------------
// ?dia= nos limites
// ---------------------------------------------------------------
test.describe('?dia= nos limites', () => {
  for (const ruim of ['2026-02-30', '2026-02-29', '2100-02-29', '0000-01-01', '0050-06-15', '2026-10-10%0A', '%20', '2026-1-1', '99999-01-01']) {
    test(`inválido ${ruim} cai em hoje`, async ({ page }) => {
      const pedidos = await simular(page)
      await page.goto(`/painel?dia=${ruim}`)
      await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
      expect(pedidos).toEqual([hojeSP()])
    })
  }
  for (const bom of ['2028-02-29', '2000-02-29', '9999-12-31', '1900-01-01']) {
    test(`válido ${bom} é pedido ao servidor e a página não quebra`, async ({ page }) => {
      const pedidos = await simular(page)
      await page.goto(`/painel?dia=${bom}`)
      await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
      expect(pedidos).toEqual([bom])
      await semRolagemHorizontal(page)
    })
  }
  test('dia repetido na URL (?dia=a&dia=b) usa o primeiro', async ({ page }) => {
    const pedidos = await simular(page)
    await page.goto('/painel?dia=2026-11-04&dia=2026-11-05')
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    await expect.poll(() => pedidos).toEqual(['2026-11-04'])
  })
  test('9999-12-31: "Próximo dia" fica desabilitado em vez de mandar para hoje em silêncio', async ({ page }) => {
    const pedidos = await simular(page)
    await page.goto('/painel?dia=9999-12-31')
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Próximo dia' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Dia anterior' })).toBeEnabled()
    await page.getByRole('button', { name: 'Dia anterior' }).click()
    await expect(page.getByRole('button', { name: 'Próximo dia' })).toBeEnabled()
    await expect.poll(() => pedidos).toEqual(['9999-12-31', '9999-12-30'])
  })
  test('0100-01-01: "Dia anterior" fica desabilitado', async ({ page }) => {
    await simular(page)
    await page.goto('/painel?dia=0100-01-01')
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dia anterior' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Próximo dia' })).toBeEnabled()
  })
})

// ---------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------
test('voltar do navegador percorre vários dias em ordem e avançar refaz', async ({ page }) => {
  const pedidos = await simular(page)
  await page.goto(`/painel?dia=${DIA}`)
  const prox = page.getByRole('button', { name: 'Próximo dia' })
  await prox.click()
  await expect(page.getByText('quinta, 05/11')).toBeVisible()
  await prox.click()
  await expect(page.getByText('sexta, 06/11')).toBeVisible()
  await page.getByRole('button', { name: 'Dia anterior' }).click()
  await page.goBack()
  await expect(page.getByText('sexta, 06/11')).toBeVisible()
  await page.goBack()
  await expect(page.getByText('quinta, 05/11')).toBeVisible()
  await page.goBack()
  await expect(page.getByText('quarta, 04/11')).toBeVisible()
  await page.goForward()
  await expect(page.getByText('quinta, 05/11')).toBeVisible()
  await expect.poll(() => pedidos.at(-1)).toBe('2026-11-05')
})

test('virada de mês e de ano pelos botões', async ({ page }) => {
  await simular(page)
  await page.goto('/painel?dia=2026-12-31')
  await page.getByRole('button', { name: 'Próximo dia' }).click()
  await expect(page.getByText('sexta, 01/01')).toBeVisible()
  await expect(page).toHaveURL(/dia=2027-01-01/)
  await page.goto('/painel?dia=2028-02-28')
  await page.getByRole('button', { name: 'Próximo dia' }).click()
  await expect(page.getByText('terça, 29/02')).toBeVisible()
})

test('meia-noite em SP: com a aba aberta o "hoje" vira sozinho (relógio simulado)', async ({ page }) => {
  await manterSessaoComRelogioSimulado(page)
  await page.clock.install({ time: new Date('2026-11-05T02:59:40Z') }) // 23:59:40 de 04/11 em SP
  const pedidos = await simular(page)
  await page.goto('/painel')
  await expect(page.getByText('quarta, 04/11')).toBeVisible()
  await expect.poll(() => pedidos[0]).toBe('2026-11-04') // o título aparece antes do primeiro pedido sair
  await page.clock.fastForward(40_000) // 00:00:20 de 05/11 em SP (02:59:40Z em UTC ainda é 04/11 ... 03:00:20Z já é 05/11 SP)
  await expect(page.getByText('quinta, 05/11')).toBeVisible()
})

// ---------------------------------------------------------------
// Horários difíceis
// ---------------------------------------------------------------
test.describe('horários difíceis', () => {
  test('23:30 que atravessa a meia-noite: aparece no dia do início, grade vai até 24h, sem estourar', async ({ page }) => {
    await simular(page, { agenda: (d) => (d === DIA ? [ag(B[0], '23:30', '00:10', 'confirmado', 'Noturno Silva', DIA, '2026-11-05')] : []) })
    await page.goto(`/painel?dia=${DIA}`)
    const b = bloco(page, /Noturno Silva/)
    await expect(b).toBeVisible()
    await expect(b).toHaveAccessibleName(/23:30 – 00:10/)
    const col = await secao(page, 'Rafael').locator('.linhas-de-hora').boundingBox()
    const bb = await b.boundingBox()
    expect(bb!.y + bb!.height).toBeLessThanOrEqual(col!.y + col!.height + 1)
    await expect(page.getByText('23:00', { exact: true })).toBeVisible()
    await semRolagemHorizontal(page)
  })

  test('o trecho depois da meia-noite aparece no dia seguinte', async ({ page }) => {
    await simular(page, { agenda: (d) => (d === '2026-11-05' ? [ag(B[0], '23:30', '00:10', 'confirmado', 'Noturno Silva', DIA, '2026-11-05')] : []) })
    await page.goto('/painel?dia=2026-11-05')
    await expect(bloco(page, /Noturno Silva/)).toBeVisible()
    await expect(page.getByText('00:00', { exact: true })).toBeVisible()
  })

  test('fora da grade (07:15 e 21:40): grade se amplia e blocos ficam visíveis', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B[0], '07:15', '07:45', 'pendente', 'Cedo Silva'), ag(B[0], '21:40', '22:10', 'confirmado', 'Tarde Silva')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Cedo Silva/)).toBeVisible()
    await expect(bloco(page, /Tarde Silva/)).toBeVisible()
    await expect(page.getByText('07:00', { exact: true })).toBeVisible()
    await expect(page.getByText('22:00', { exact: true })).toBeVisible()
  })

  test('bloqueio do dia todo e bloqueio com motivo enorme não estouram', async ({ page }) => {
    const longo = 'Compromisso '.repeat(10) + 'X'.repeat(80)
    await simular(page, {
      agenda: () => [],
      bloqueios: () => [
        { id: id(2, 1), barbeiro_id: null, barbeiro_nome: null, inicio: sp('00:00'), fim: '2026-11-05T00:00:00-03:00', motivo: longo },
        { id: id(2, 2), barbeiro_id: B[1].id, barbeiro_nome: 'Diego', inicio: sp('10:00'), fim: sp('10:15'), motivo: '<img src=x onerror=alert(1)>' },
      ],
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('.listras').first()).toBeAttached()
    await semRolagemHorizontal(page)
    await nadaVaza(page)
    if (!ehCelular()) await expect(page.locator('img[src="x"]')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------
// Texto longo e muitos sobrepostos
// ---------------------------------------------------------------
test.describe('conteúdo extremo', () => {
  const NOME_LONGO = 'Maximiliano'.repeat(8) // 88 caracteres, sem espaço
  test('nome enorme sem espaços em blocos de 15, 30 e 60 min não estoura bloco nem página', async ({ page }) => {
    await simular(page, {
      agenda: () => [
        ag(B[0], '09:00', '09:15', 'pendente', NOME_LONGO),
        ag(B[0], '10:00', '10:30', 'confirmado', NOME_LONGO),
        ag(B[0], '11:00', '12:00', 'cancelado', NOME_LONGO),
        ag(B[0], '13:00', '14:00', 'confirmado', NOME_LONGO),
        ag(B[0], '13:00', '14:00', 'cancelado', NOME_LONGO),
      ],
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('section[id^="coluna-"]:visible button').first()).toBeVisible()
    await semRolagemHorizontal(page)
    await nadaVaza(page)
    const col = await secao(page, 'Rafael').boundingBox()
    for (const b of await page.locator('section[id^="coluna-"]:visible button').all()) {
      const bb = await b.boundingBox()
      expect(bb!.x).toBeGreaterThanOrEqual(col!.x - 1)
      expect(bb!.x + bb!.width).toBeLessThanOrEqual(col!.x + col!.width + 1)
      const sobra = await b.evaluate((e) => [...e.querySelectorAll(':scope > span')].some((p) => p.getBoundingClientRect().right > e.getBoundingClientRect().right + 1))
      expect(sobra).toBe(false)
    }
  })

  test('nome enorme também não estoura a aba/cabeçalho do barbeiro', async ({ page }) => {
    await simular(page, { barbeiros: [BARB(1, 'Maximiliano'.repeat(6)), BARB(2, 'Diego')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    await semRolagemHorizontal(page)
  })

  test('10 agendamentos sobrepostos (9 cancelados): sem estourar; o ativo continua legível pelo nome acessível', async ({ page }) => {
    const lista = [ag(B[0], '10:00', '11:00', 'confirmado', 'Ativo Unico')]
    for (let i = 0; i < 9; i++) lista.push(ag(B[0], '10:00', '11:00', 'cancelado', `Cancelado ${i}`))
    await simular(page, { agenda: () => lista })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Unico/)).toBeVisible()
    await semRolagemHorizontal(page)
    await nadaVaza(page)
    const largura = (await bloco(page, /Ativo Unico/).boundingBox())!.width
    // Informativo: largura do bloco ativo quando há 10 faixas.
    test.info().annotations.push({ type: 'largura-do-bloco-ativo-com-10-faixas', description: `${Math.round(largura)}px` })
    expect(largura).toBeGreaterThan(0)
  })

  test('3 ativos no mesmo horário (dado impossível pela constraint, mas o painel não pode quebrar)', async ({ page }) => {
    await simular(page, { agenda: () => [0, 1, 2].map((i) => ag(B[0], '10:00', '10:40', 'pendente', `Triplo ${i}`)) })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('section[id^="coluna-"]:visible button')).toHaveCount(3)
    await semRolagemHorizontal(page)
  })
})

// ---------------------------------------------------------------
// Erros e sem barbeiro
// ---------------------------------------------------------------
test.describe('falhas parciais', () => {
  for (const modo of ['erro500', 'abortar'] as const) {
    test(`tabela barbeiros ${modo} com as RPCs ok: mostra erro, nunca uma agenda sem colunas`, async ({ page }) => {
      await simular(page, { barbeiros: modo, agenda: () => [ag(B[0], '10:00', '11:00', 'confirmado', 'Fulano Teste')] })
      await page.goto(`/painel?dia=${DIA}`)
      // supabase-js repete GET com falha de rede (backoff ~7 s) antes de desistir.
      await expect(page.getByRole('alert')).toContainText('Não deu para carregar a agenda.', { timeout: 20_000 })
      await expect(page.getByText('Nenhum barbeiro ativo')).toHaveCount(0)
      await expect(page.locator('section[id^="coluna-"]:visible button')).toHaveCount(0)
    })
  }

  test('sem barbeiro ativo mas com agendamento de barbeiro desativado: o atendimento aparece', async ({ page }) => {
    await simular(page, { barbeiros: [], agenda: () => [ag(B[0], '10:00', '11:00', 'confirmado', 'Orfao Silva')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Orfao Silva/)).toBeVisible()
  })

  test('sem barbeiro ativo: não há tablist nem coluna, só a mensagem, e sem rolagem horizontal', async ({ page }) => {
    await simular(page, { barbeiros: [] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText(/Nenhum barbeiro ativo/)).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
    await semRolagemHorizontal(page)
  })

  test('respostas null do RPC (data: null) não quebram', async ({ page }) => {
    const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
    await simularEquipe(page)
    await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(B)))
    await page.route('**/rest/v1/rpc/listar_*', (r) => r.fulfill(json(null)))
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
  })

  test('status desconhecido vindo do banco aparece sem derrubar a tela', async ({ page }) => {
    await simular(page, { agenda: () => [ag(B[0], '10:00', '11:00', 'em_analise', 'Status Novo')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Status Novo/)).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Teclado e abas (celular)
// ---------------------------------------------------------------
test.describe('abas: teclado completo', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ehCelular(), 'abas só no celular')
    await simular(page, { agenda: () => [ag(B[0], '10:00', '11:00', 'confirmado', 'Ana Teste')] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Teste/)).toBeVisible()
  })

  test('ArrowLeft no primeiro vai ao último; Home volta ao primeiro; só a aba ativa tem tabindex 0', async ({ page }) => {
    const abas = page.getByRole('tab')
    await abas.first().focus()
    await page.keyboard.press('ArrowLeft')
    await expect(abas.nth(2)).toBeFocused()
    await expect(abas.nth(2)).toHaveAttribute('aria-selected', 'true')
    await expect(abas.nth(2)).toHaveAttribute('tabindex', '0')
    await expect(abas.nth(0)).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('Home')
    await expect(abas.nth(0)).toBeFocused()
    await expect(abas.nth(0)).toHaveAttribute('aria-selected', 'true')
  })

  test('foco visível: aba focada pelo teclado tem contorno de 2px', async ({ page }) => {
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowRight')
    const o = await page.getByRole('tab').nth(1).evaluate((e) => { const s = getComputedStyle(e); return { w: s.outlineWidth, st: s.outlineStyle } })
    expect(o.st).not.toBe('none')
    expect(parseFloat(o.w)).toBeGreaterThanOrEqual(2)
  })

  test('Tab sai da lista de abas direto para o conteúdo (uma parada só na lista)', async ({ page }) => {
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('Tab')
    const dentro = await page.evaluate(() => document.activeElement?.closest('[role="tablist"]') !== null)
    expect(dentro).toBe(false)
    await expect(bloco(page, /Ana Teste/)).toBeFocused()
  })

  test('bloco focado pelo teclado mostra contorno', async ({ page }) => {
    await bloco(page, /Ana Teste/).focus()
    const o = await bloco(page, /Ana Teste/).evaluate((e) => getComputedStyle(e).outlineStyle)
    expect(o).not.toBe('none')
  })

  test('tecla Enter/Espaço em aba não quebra; setas verticais não mudam de aba', async ({ page }) => {
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
  })

  test('aria-controls de cada aba aponta para um tabpanel existente', async ({ page }) => {
    for (const a of await page.getByRole('tab').all()) {
      const alvo = await a.getAttribute('aria-controls')
      await expect(page.locator(`#${alvo}`)).toHaveAttribute('role', 'tabpanel')
    }
  })

  test('8 barbeiros em 360px: a lista de abas rola por dentro e a página não', async ({ page }) => {
    const oito = Array.from({ length: 8 }, (_, i) => BARB(i + 1, `Barbeiro${i + 1}`))
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await simular(page, { barbeiros: oito })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('tab')).toHaveCount(8)
    await semRolagemHorizontal(page)
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab').nth(7)).toBeInViewport()
    await semRolagemHorizontal(page)
  })
})

test('cruzar o breakpoint com a página aberta troca abas por colunas sem perder dados', async ({ page }) => {
  await simular(page, { agenda: () => [ag(B[0], '10:00', '11:00', 'confirmado', 'Ana Teste'), ag(B[1], '10:00', '11:00', 'confirmado', 'Beto Teste')] })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`/painel?dia=${DIA}`)
  await expect(page.getByRole('tab')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /Beto Teste/ })).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('tab')).toBeHidden()
  await expect(bloco(page, /Beto Teste/)).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(0)
  await semRolagemHorizontal(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect(page.getByRole('tabpanel')).toHaveCount(1) // só o painel visível entra na árvore de acessibilidade
  await expect(page.locator('[role="tabpanel"]')).toHaveCount(3)
})

// ---------------------------------------------------------------
// Contraste computado no navegador
// ---------------------------------------------------------------
test('contraste AA computado de cada status no navegador (texto do bloco x fundo do bloco)', async ({ page }) => {
  const lista = ['pendente', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu'].map((s, i) =>
    ag(B[0], `${String(9 + i * 2).padStart(2, "0")}:00`, `${String(10 + i * 2).padStart(2, "0")}:00`, s, `Cliente ${s}`))
  await simular(page, { agenda: () => lista })
  await page.goto(`/painel?dia=${DIA}&cancelados=1`) // o cancelado só está na grade com o filtro ligado (F9)
  await expect(page.locator('section[id^="coluna-"]:visible button')).toHaveCount(5)
  const ruins = await page.evaluate(() => {
    const lum = (rgb: number[]) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
    const fundoDe = (e: Element | null): number[] => {
      for (let n = e; n; n = n.parentElement) { const v = parse(getComputedStyle(n).backgroundColor); if (v.length === 3 || (v.length === 4 && v[3] > 0)) return v.slice(0, 3) }
      return [0, 0, 0]
    }
    const out: string[] = []
    for (const art of document.querySelectorAll('section[id^="coluna-"] button')) {
      for (const p of art.querySelectorAll('p, span')) {
        if (!p.textContent?.trim() || p.children.length > 0 && p.tagName === 'P' && !p.textContent) continue
        const cs = getComputedStyle(p)
        const fg = parse(cs.color).slice(0, 3)
        const l1 = lum(fg), l2 = lum(fundoDe(p))
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        if (ratio < 4.5) out.push(`${art.getAttribute('aria-label')} :: "${p.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)}`)
      }
    }
    return out
  })
  expect(ruins).toEqual([])
})

// ---------------------------------------------------------------
// Visita real, somente leitura
// ---------------------------------------------------------------
test('visita real ao dia de hoje com a conta do .env: sem erro e sem escrever nada', async ({ page }) => {
  const escritas: string[] = []
  const leituras: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.includes('.supabase.co')) return
    const rota = u.split('/rest/v1/')[1] ?? u.split('.supabase.co')[1]
    if (r.method() === 'GET') leituras.push(rota.split('?')[0])
    else if (!/^rpc\/(listar_agenda|listar_bloqueios|is_equipe)/.test(rota) && !u.includes('/auth/v1/token')) escritas.push(`${r.method()} ${rota}`)
  })
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto('/painel')
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible()
  await expect(page.getByText('Hoje', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Carregando a agenda')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  // Há colunas (barbeiros reais) ou, no pior caso, a mensagem de sem barbeiro; nunca erro.
  const colunas = await page.locator('section[id^="coluna-"]').count()
  expect(colunas).toBeGreaterThan(0)
  await semRolagemHorizontal(page)
  expect(escritas).toEqual([])
  expect(erros).toEqual([])
  test.info().annotations.push({ type: 'colunas-reais', description: String(colunas) })
})
