import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// QA do incremento 4.3 (visão da semana). Dados SIMULADOS com page.route, exceto o último bloco, que visita
// a semana real com a conta do .env em SÓ LEITURA (só navega; nenhum clique em ação).

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-semana-qa')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const B4_INATIVO = '00000000-0000-4000-8000-0000000000b4'
const NOMES: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio', [B4_INATIVO]: 'Antigo' }
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
  { id: B3, nome: 'Caio' },
]

let cont = 0
const sp = (dia: string, hhmm: string) => `${dia}T${hhmm}:00-03:00`
function ag(barbeiro: string, dia: string, hhmm: string, status: string, nomeBarbeiro = NOMES[barbeiro]) {
  cont++
  const [h, m] = hhmm.split(':').map(Number)
  const fim = `${String(h + Math.floor((m + 30) / 60)).padStart(2, '0')}:${String((m + 30) % 60).padStart(2, '0')}`
  return {
    id: `10000000-0000-4000-8000-${String(cont).padStart(12, '0')}`,
    codigo: `Q${String(cont).padStart(5, '0')}`,
    status,
    inicio: sp(dia, hhmm),
    fim: sp(dia, fim),
    barbeiro_id: barbeiro,
    barbeiro_nome: nomeBarbeiro,
    servico_nome: 'Corte',
    servico_tipo: 'avulso',
    cliente_nome: 'Cliente',
    cliente_telefone: '11999990000',
  }
}
function bloqueio(barbeiro: string | null, ini: string, fim: string, motivo: string) {
  cont++
  return {
    id: `20000000-0000-4000-8000-${String(cont).padStart(12, '0')}`,
    barbeiro_id: barbeiro,
    barbeiro_nome: barbeiro === null ? null : NOMES[barbeiro],
    inicio: ini,
    fim,
    motivo,
  }
}

const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const sempre = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
/** O servidor devolve o que cai em [de 00:00 SP, ate+1 00:00 SP). */
const noPeriodo = (inicio: string, de: string, ate: string) =>
  Date.parse(inicio) >= Date.parse(sp(de, '00:00')) && Date.parse(inicio) < Date.parse(sp(somar(ate, 1), '00:00'))

interface Opc {
  agenda: (de: string, ate: string, n: number) => ReturnType<typeof ag>[]
  bloqueios?: (de: string, ate: string) => ReturnType<typeof bloqueio>[]
  atraso?: (de: string, n: number) => number
}
async function simular(page: Page, { agenda, bloqueios = () => [], atraso = () => 0 }: Opc) {
  const pedidos: string[] = []
  let n = 0
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(sempre(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => {
    const { p_de, p_ate } = r.request().postDataJSON() as { p_de: string; p_ate: string }
    return r.fulfill(sempre(bloqueios(p_de, p_ate)))
  })
  await page.route('**/rest/v1/rpc/listar_agenda*', async (r) => {
    const { p_de, p_ate } = r.request().postDataJSON() as { p_de: string; p_ate: string }
    const meu = ++n
    pedidos.push(`${p_de}..${p_ate}`)
    const espera = atraso(p_de, meu)
    if (espera > 0) await new Promise((res) => setTimeout(res, espera))
    return r.fulfill(sempre(agenda(p_de, p_ate, meu)))
  })
  return { pedidos }
}

const lista = (page: Page) => page.getByRole('list', { name: 'Dias da semana' })
const cartao = (page: Page, rotulo: string) => page.getByRole('link', { name: new RegExp(`^${rotulo}`) })
const titulo = (page: Page) => page.getByRole('heading', { level: 1 })
const ehCelular = () => test.info().project.name === 'celular'
async function semRolagem(page: Page) {
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)
}

// Semana de referência (02/11 a 08/11/2026), com dias fechados (seg e dom) COM agendamento.
const SEMANA_FECHADOS = [
  ag(B1, '2026-11-02', '10:00', 'pendente'), // segunda, fechada
  ag(B2, '2026-11-03', '10:00', 'confirmado'),
  ag(B2, '2026-11-03', '11:00', 'cancelado'),
  ag(B3, '2026-11-04', '10:00', 'nao_compareceu'),
  ag(B1, '2026-11-04', '10:00', 'pendente'),
  ag(B1, '2026-11-06', '23:30', 'confirmado'),
  ag(B2, '2026-11-08', '09:00', 'confirmado'), // domingo, fechado
  ag(B3, '2026-11-08', '23:30', 'pendente'), // domingo 23:30 SP
]
const BLOQ_SEMANA = [
  bloqueio(null, sp('2026-11-04', '12:00'), sp('2026-11-04', '13:00'), 'Almoço da equipe'),
  bloqueio(B3, sp('2026-11-07', '15:00'), sp('2026-11-08', '10:00'), 'Folga do Caio'),
]
const agendaFixa = (de: string, ate: string) => SEMANA_FECHADOS.filter((a) => noPeriodo(a.inicio, de, ate))
const bloqFixos = (de: string, ate: string) =>
  BLOQ_SEMANA.filter((k) => Date.parse(k.inicio) < Date.parse(sp(somar(ate, 1), '00:00')) && Date.parse(k.fim) > Date.parse(sp(de, '00:00')))

// ---------------------------------------------------------------
// ?visao inválida
// ---------------------------------------------------------------
test.describe('visao inválida', () => {
  for (const q of ['visao=SEMANA', 'visao=', 'visao=%20semana', 'visao=semana%00', 'visao=%3Cscript%3E', 'visao=semanas', 'visao[]=semana']) {
    test(`?${q}&dia=2026-11-04 cai no Dia sem quebrar`, async ({ page }) => {
      await simular(page, { agenda: agendaFixa })
      const erros: string[] = []
      page.on('pageerror', (e) => erros.push(e.message))
      await page.goto(`/painel?${q}&dia=2026-11-04`)
      await expect(titulo(page)).toHaveText('Agenda do dia')
      await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true')
      expect(erros).toEqual([])
    })
  }
  test('visao repetida: usa a primeira ocorrência (semana) e a UI e a URL concordam', async ({ page }) => {
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&visao=dia&dia=2026-11-04')
    await expect(titulo(page)).toHaveText('Agenda da semana')
    await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
  test('dia impossível (2026-02-30) e dia com lixo na semana caem em hoje, sem erro', async ({ page }) => {
    const { pedidos } = await simular(page, { agenda: () => [] })
    await page.goto('/painel?visao=semana&dia=2026-02-30')
    await expect(lista(page)).toBeVisible()
    await expect(page.getByText('Esta semana', { exact: true }).first()).toBeVisible()
    expect(pedidos).toHaveLength(1)
  })
  test('parâmetro extra é descartado ao trocar de visão (URL limpa)', async ({ page }) => {
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&dia=2026-11-04&x=1')
    await page.getByRole('button', { name: 'Dia', exact: true }).click()
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-04$/)
  })
})

// ---------------------------------------------------------------
// Trocas rápidas
// ---------------------------------------------------------------
test.describe('trocas rápidas', () => {
  test('Dia/Semana/Dia/Semana em sequência, respostas fora de ordem: termina na semana certa e sem sobra do Dia', async ({ page }) => {
    // as primeiras respostas demoram mais que as últimas
    await simular(page, { agenda: agendaFixa, bloqueios: bloqFixos, atraso: (_d, n) => Math.max(0, 1600 - n * 350) })
    await page.goto('/painel?dia=2026-11-04')
    const dia = page.getByRole('button', { name: 'Dia', exact: true })
    const sem = page.getByRole('button', { name: 'Semana', exact: true })
    for (let i = 0; i < 3; i++) {
      await sem.click()
      await dia.click()
    }
    await sem.click()
    await expect(titulo(page)).toHaveText('Agenda da semana')
    await page.waitForTimeout(2500)
    await expect(titulo(page)).toHaveText('Agenda da semana')
    await expect(lista(page).getByRole('link')).toHaveCount(7)
    await expect(cartao(page, 'terça, 03/11')).toHaveAccessibleName(/1 atendimento\b/)
    await expect(page.locator('section[id^="coluna-"]')).toHaveCount(0)
    await expect(page).toHaveURL(/visao=semana&dia=2026-11-04$/)
  })

  test('Dia/Semana rápidos terminando no Dia: grade do dia, sem cartões da semana', async ({ page }) => {
    await simular(page, { agenda: agendaFixa, atraso: (_d, n) => Math.max(0, 1500 - n * 300) })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    const dia = page.getByRole('button', { name: 'Dia', exact: true })
    const sem = page.getByRole('button', { name: 'Semana', exact: true })
    await dia.click()
    await sem.click()
    await dia.click()
    await page.waitForTimeout(2200)
    await expect(titulo(page)).toHaveText('Agenda do dia')
    await expect(lista(page)).toHaveCount(0)
    await expect(page.locator('section[id^="coluna-"]').first()).toBeAttached()
  })

  test('semanas trocadas rápido nunca mostram dado de outra semana (monitor de DOM a cada mutação)', async ({ page }) => {
    // Semana com início D tem (índice+2) atendimentos na terça de D (D+1). 26/10 -> 2, 02/11 -> 3, 09/11 -> 4...
    const base = '2026-10-26'
    const esperado = (de: string) => Math.round((Date.parse(de) - Date.parse(base)) / (7 * 86400000)) + 2
    await simular(page, {
      agenda: (de) => Array.from({ length: esperado(de) }, (_, i) => ag(B1, somar(de, 1), `${String(9 + i).padStart(2, '0')}:00`, 'confirmado')),
      // semanas mais antigas respondem mais devagar
      atraso: (de) => 1400 - (Date.parse(de) - Date.parse('2026-11-02')) / 86400000 * 60,
    })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    await expect(cartao(page, 'terça, 03/11')).toHaveAccessibleName(/3 atendimentos/)
    await page.evaluate(() => {
      const w = window as unknown as { __erros: string[] }
      w.__erros = []
      const checar = () => {
        const rotulo = document.querySelector('p[aria-live="polite"] span')?.textContent ?? ''
        const ul = document.querySelector('ul[aria-label="Dias da semana"]')
        if (!ul) return
        const terca = [...ul.querySelectorAll('a')].find((a) => (a.getAttribute('aria-label') ?? '').startsWith('terça'))
        w.__erros.push(`${rotulo} | ${terca?.getAttribute('aria-label')}`)
      }
      new MutationObserver(checar).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })
    })
    const prox = page.getByRole('button', { name: 'Próxima semana' })
    const ant = page.getByRole('button', { name: 'Semana anterior' })
    await prox.click()
    await prox.click()
    await prox.click()
    await ant.click()
    await page.waitForTimeout(2500)
    // semana final: 09/11 + 7 = 16/11 (3 cliques para frente, 1 para trás a partir de 02/11)
    await expect(page.getByText('16/11 – 22/11', { exact: true })).toBeVisible()
    await expect(cartao(page, 'terça, 17/11')).toHaveAccessibleName(/5 atendimentos/)
    const registros = await page.evaluate(() => (window as unknown as { __erros: string[] }).__erros)
    // cada registro "dd/mm – dd/mm | terça, dd/mm, N atendimentos, ..." precisa ter a terça dentro da semana do rótulo
    for (const r of registros) {
      const m = r.match(/^(\d\d)\/(\d\d) – (\d\d)\/(\d\d) \| terça, (\d\d)\/(\d\d), (\d+) atendimento/)
      if (!m) continue
      expect(`${m[5]}/${m[6]}`, r).toBe(`${String(Number(m[1]) + 1).padStart(2, '0')}/${m[2]}`)
    }
  })
})

// ---------------------------------------------------------------
// Histórico do navegador
// ---------------------------------------------------------------
test.describe('voltar e avançar', () => {
  test('semana -> dia -> voltar volta à MESMA semana; voltar de novo vai ao Dia inicial; avançar refaz', async ({ page }) => {
    await simular(page, { agenda: agendaFixa, bloqueios: bloqFixos })
    await page.goto('/painel?dia=2026-11-04')
    await page.getByRole('button', { name: 'Semana', exact: true }).click()
    await page.getByRole('button', { name: 'Próxima semana' }).click()
    await expect(page.getByText('09/11 – 15/11', { exact: true })).toBeVisible()
    await cartao(page, 'quinta, 12/11').click()
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-12$/)
    await expect(page.getByText('quinta, 12/11')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/visao=semana&dia=2026-11-11$/)
    await expect(page.getByText('09/11 – 15/11', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(lista(page).getByRole('link')).toHaveCount(7)

    await page.goBack()
    await expect(page.getByText('02/11 – 08/11', { exact: true })).toBeVisible()
    await expect(cartao(page, 'terça, 03/11')).toHaveAccessibleName(/1 atendimento\b/)

    await page.goBack()
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-04$/)
    await expect(titulo(page)).toHaveText('Agenda do dia')

    await page.goForward()
    await page.goForward()
    await page.goForward()
    await expect(page.getByText('quinta, 12/11')).toBeVisible()
  })

  test('foco ao voltar do Dia para a Semana não vai para o título nem some (nada de foco roubado)', async ({ page }) => {
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    await cartao(page, 'terça, 03/11').click()
    await expect(titulo(page)).toBeFocused()
    await page.goBack()
    await expect(lista(page)).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)).not.toBe('H1')
  })

  test('abrir dia em nova aba (ctrl+clique) leva para o Dia correto', async ({ page, context }) => {
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    const href = await cartao(page, 'quarta, 04/11').getAttribute('href')
    expect(href).toBe('/painel?dia=2026-11-04')
    const nova = await context.newPage()
    await simular(nova, { agenda: agendaFixa })
    await nova.goto(href!)
    await expect(nova.getByText('quarta, 04/11')).toBeVisible()
    await expect(nova.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
  })
})

// ---------------------------------------------------------------
// Números da semana x visão Dia
// ---------------------------------------------------------------
test.describe('semana bate com a visão Dia', () => {
  test('para cada dia: total da semana == soma das colunas do Dia; pendentes e bloqueios coerentes', async ({ page }) => {
    await simular(page, { agenda: agendaFixa, bloqueios: bloqFixos })
    const dias = Array.from({ length: 7 }, (_, i) => somar('2026-11-02', i))
    for (const d of dias) {
      await page.goto('/painel?visao=semana&dia=2026-11-04')
      const [dd, mm] = [d.slice(8), d.slice(5, 7)]
      const nome = await page.getByRole('link', { name: new RegExp(`, ${dd}/${mm}`) }).getAttribute('aria-label')
      const totalSemana = Number(nome!.match(/(\d+) atendimento/)?.[1] ?? 0)
      const pendSemana = Number(nome!.match(/(\d+) pendente/)?.[1] ?? 0)
      const bloqSemana = Number(nome!.match(/(\d+) bloqueio/)?.[1] ?? 0)

      await page.getByRole('link', { name: new RegExp(`, ${dd}/${mm}`) }).click()
      await expect(titulo(page)).toHaveText('Agenda do dia')
      await expect(page.locator('section[id^="coluna-"]').first()).toBeAttached()
      const { totalDia, pendDia, temBloqueio } = await page.evaluate(() => {
        const cab = [...document.querySelectorAll('section[id^="coluna-"] header span')]
        const totalDia = cab.reduce((s, el) => s + Number(el.textContent?.match(/\d+/)?.[0] ?? 0), 0)
        const arts = [...document.querySelectorAll('section[id^="coluna-"] button')]
        const pendDia = arts.filter((a) => /pendente$/i.test(a.getAttribute('aria-label') ?? '')).length
        const temBloqueio = document.querySelectorAll('button[aria-label^="Bloqueio"]').length > 0
        return { totalDia, pendDia, temBloqueio }
      })
      expect(totalDia, `total do dia ${d}`).toBe(totalSemana)
      expect(pendDia, `pendentes do dia ${d}`).toBe(pendSemana)
      expect(temBloqueio, `bloqueio do dia ${d}`).toBe(bloqSemana > 0)
    }
  })

  test('dia fechado COM agendamento: aparece "Fechado" e o número, e o Dia mostra o agendamento', async ({ page }) => {
    await simular(page, { agenda: agendaFixa, bloqueios: bloqFixos })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    for (const [rotulo, esperado] of [['segunda, 02/11', /fechado, 1 atendimento, 1 pendente/], ['domingo, 08/11', /fechado, 2 atendimentos, 1 pendente, 1 bloqueio/]] as const) {
      await expect(cartao(page, rotulo)).toHaveAccessibleName(esperado)
      await expect(cartao(page, rotulo)).toContainText('Fechado')
      await expect(cartao(page, rotulo)).toContainText(/[12]\s*atendimento/)
    }
    await cartao(page, 'domingo, 08/11').click()
    await expect(page.getByText('A barbearia não abre neste dia.')).toHaveCount(0) // há agendamento: o aviso de "vazio" não aparece
    await expect(page.locator('section[id^="coluna-"] button:not([aria-label^="Bloqueio"])')).toHaveCount(2)
  })

  test('bloqueio de barbeiro INATIVO: a semana e o Dia concordam?', async ({ page }) => {
    // listar_bloqueios devolve bloqueios de qualquer barbeiro; a lista de barbeiros só traz os ativos.
    await simular(page, {
      agenda: () => [],
      bloqueios: () => [bloqueio(B4_INATIVO, sp('2026-11-04', '10:00'), sp('2026-11-04', '12:00'), 'Curso do Antigo')],
    })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    const nomeSemana = await cartao(page, 'quarta, 04/11').getAttribute('aria-label')
    const diz = /bloqueio/.test(nomeSemana!)
    await cartao(page, 'quarta, 04/11').click()
    await expect(page.locator('section[id^="coluna-"]').first()).toBeAttached()
    const dia = await page.locator('button[aria-label^="Bloqueio"]').count()
    expect(dia > 0, `semana diz bloqueio=${diz}; visão Dia mostra ${dia} bloqueio(s)`).toBe(diz)
  })
})

// ---------------------------------------------------------------
// Domingo 23:30 / virada de dia com o relógio do navegador
// ---------------------------------------------------------------
test.describe('relógio', () => {
  test('domingo 23:30 em SP: "hoje" é domingo e a semana é a que termina nele', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-09T02:30:00Z') }) // 08/11 23:30 em SP
    const { pedidos } = await simular(page, { agenda: () => [] })
    await page.goto('/painel?visao=semana')
    await expect(page.getByText('02/11 – 08/11', { exact: true })).toBeVisible()
    await expect(lista(page).locator('a[aria-current="date"]')).toHaveAccessibleName(/^domingo, 08\/11, hoje/)
    expect(pedidos).toEqual(['2026-11-02..2026-11-08'])
  })

  test('virou segunda 00:00 com a aba aberta (sem ?dia): a semana passa para a seguinte e hoje muda', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-09T02:59:40Z') })
    const { pedidos } = await simular(page, { agenda: () => [] })
    await page.goto('/painel?visao=semana')
    await expect(lista(page).locator('a[aria-current="date"]')).toHaveAccessibleName(/^domingo, 08\/11, hoje/)
    await page.clock.fastForward(40_000)
    await expect(page.getByText('09/11 – 15/11', { exact: true })).toBeVisible()
    await expect(lista(page).locator('a[aria-current="date"]')).toHaveAccessibleName(/^segunda, 09\/11, hoje/)
    expect(pedidos.at(-1)).toBe('2026-11-09..2026-11-15')
  })

  test('navegador em outro fuso (Tóquio) perto da meia-noite: semana e hoje seguem SP', async ({ browser }, info) => {
    const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, storageState: ESTADO, timezoneId: 'Asia/Tokyo', viewport: info.project.use.viewport })
    const page = await ctx.newPage()
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-09T02:30:00Z') }) // em Tóquio já é segunda 11:30
    await simular(page, { agenda: () => [] })
    await page.goto('/painel?visao=semana')
    await expect(page.getByText('02/11 – 08/11', { exact: true })).toBeVisible()
    await ctx.close()
  })
})

// ---------------------------------------------------------------
// Contraste (AA) medido nos estilos renderizados
// ---------------------------------------------------------------
test.describe('contraste', () => {
  test('textos do cartão da semana (neon, chumbo, cinza) >= 4.5:1 sobre o fundo real, em repouso e em hover', async ({ page }) => {
    await simular(page, { agenda: agendaFixa, bloqueios: bloqFixos })
    // hoje fixo na semana mostrada para renderizar o destaque "Hoje" (neon sobre asfalto)
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-04T15:00:00Z') })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    await expect(lista(page)).toBeVisible()
    const medir = () =>
      page.evaluate(() => {
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
        const fundo = (el: Element | null): number[] => {
          // sobe até achar fundo opaco
          for (let e: Element | null = el; e; e = e.parentElement) {
            const c = rgb(getComputedStyle(e).backgroundColor)
            if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) return c
          }
          return [0, 0, 0]
        }
        const saida: { texto: string; razao: number }[] = []
        const raiz = document.querySelector('ul[aria-label="Dias da semana"]')!
        const nos = raiz.querySelectorAll('a *')
        for (const el of nos) {
          const proprio = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
          if (!proprio) continue
          const cor = rgb(getComputedStyle(el).color)
          const bg = fundo(el)
          const [x, y] = [lum(cor), lum(bg)].sort((p, q) => q - p)
          saida.push({ texto: (el.textContent ?? '').trim().slice(0, 30), razao: (x + 0.05) / (y + 0.05) })
        }
        return saida
      })
    const repouso = await medir()
    expect(repouso.length).toBeGreaterThan(10)
    for (const m of repouso) expect(m.razao, `"${m.texto}" em repouso`).toBeGreaterThanOrEqual(4.5)
    await cartao(page, 'sábado, 07/11').hover()
    const hover = await medir()
    for (const m of hover) expect(m.razao, `"${m.texto}" em hover`).toBeGreaterThanOrEqual(4.5)
  })

  test('foco por teclado nos cartões é visível (contorno com contraste e fora do corte)', async ({ page }) => {
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    await cartao(page, 'terça, 03/11').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    const alvo = cartao(page, 'terça, 03/11')
    await expect(alvo).toBeFocused()
    const o = await alvo.evaluate((el) => { const s = getComputedStyle(el); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle, c: s.outlineColor } })
    expect(o.st).not.toBe('none')
    expect(o.w).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------
// Larguras
// ---------------------------------------------------------------
test.describe('larguras', () => {
  const CHEIA = [
    ...Array.from({ length: 7 }, (_, i) => somar('2026-11-02', i)).flatMap((d) => [
      ag(B1, d, '09:00', 'pendente'), ag(B2, d, '10:00', 'pendente'), ag(B3, d, '11:00', 'confirmado'),
    ]),
    ag(B1, '2026-11-04', '12:00', 'pendente', 'Maximiliano Sobrenome Muito Comprido Da Silva'),
  ]
  const BLOQS_MUITOS = Array.from({ length: 12 }, (_, i) => bloqueio(null, sp('2026-11-04', `${String(8 + (i % 10)).padStart(2, '0')}:00`), sp('2026-11-04', `${String(8 + (i % 10)).padStart(2, '0')}:30`), `B${i}`))

  for (const largura of [320, 360, 414, 767, 768, 900, 1023, 1024, 1100, 1280]) {
    test(`${largura}px: sem rolagem horizontal e nada vaza do cartão`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 })
      await simular(page, { agenda: () => CHEIA, bloqueios: () => BLOQS_MUITOS })
      await page.goto('/painel?visao=semana&dia=2026-11-04')
      await expect(lista(page).getByRole('link')).toHaveCount(7)
      await semRolagem(page)
      const vazamentos = await page.evaluate(() => {
        const out: string[] = []
        for (const a of document.querySelectorAll('ul[aria-label="Dias da semana"] > li > a')) {
          const r = a.getBoundingClientRect()
          for (const f of a.querySelectorAll('*')) {
            const fr = f.getBoundingClientRect()
            if (fr.width === 0) continue
            if (fr.right > r.right + 0.5 || fr.left < r.left - 0.5) out.push(`${a.getAttribute('aria-label')?.slice(0, 20)} -> ${f.tagName} "${(f.textContent ?? '').slice(0, 20)}" ${Math.round(fr.right - r.right)}px`)
          }
        }
        return out
      })
      expect(vazamentos).toEqual([])
      // layout: lista vertical abaixo de 1024, 7 colunas a partir dele
      const caixas = await lista(page).getByRole('listitem').evaluateAll((els) => els.filter((e) => e.parentElement?.getAttribute('aria-label') === 'Dias da semana').map((e) => e.getBoundingClientRect().toJSON()))
      const lado = caixas.slice(0, 7)
      if (largura >= 1024) expect(Math.abs(lado[6].y - lado[0].y)).toBeLessThan(2)
      else expect(lado[6].y).toBeGreaterThan(lado[0].y)
    })
  }

  test('alvo de toque do cartão e do seletor tem pelo menos 44px de altura no celular', async ({ page }) => {
    test.skip(!ehCelular(), 'só no celular')
    await simular(page, { agenda: agendaFixa })
    await page.goto('/painel?visao=semana&dia=2026-11-04')
    for (const alvo of [cartao(page, 'quinta, 05/11'), page.getByRole('button', { name: 'Dia', exact: true }), page.getByRole('button', { name: 'Próxima semana' })]) {
      expect((await alvo.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

// ---------------------------------------------------------------
// Conta real, só leitura
// ---------------------------------------------------------------
test.describe('semana atual real (conta do .env, só leitura)', () => {
  test('carrega a semana de hoje, sem erro, sem rolagem horizontal, e cada dia bate com o Dia', async ({ page }) => {
    test.setTimeout(120_000)
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })
    const pedidos: string[] = []
    page.on('request', (r) => { if (r.url().includes('/rest/v1/rpc/listar_agenda')) pedidos.push(r.postData() ?? '') })

    await page.goto('/painel?visao=semana')
    await expect(lista(page).getByRole('link')).toHaveCount(7, { timeout: 20_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('Esta semana', { exact: true }).first()).toBeVisible()
    await expect(lista(page).locator('a[aria-current="date"]')).toHaveCount(1)
    await semRolagem(page)
    expect(pedidos).toHaveLength(1)
    const corpo = JSON.parse(pedidos[0]) as { p_de: string; p_ate: string }
    expect((Date.parse(corpo.p_ate) - Date.parse(corpo.p_de)) / 86400000).toBe(6)

    const nomes = await lista(page).getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
    for (const nome of nomes) {
      const ddmm = nome.match(/(\d\d\/\d\d)/)![1]
      const totalSemana = Number(nome.match(/(\d+) atendimento/)?.[1] ?? 0)
      const pendSemana = Number(nome.match(/(\d+) pendente/)?.[1] ?? 0)
      await page.getByRole('link', { name: new RegExp(`, ${ddmm}`) }).click()
      await expect(titulo(page)).toHaveText('Agenda do dia')
      await expect(page.getByText(/^\p{L}+, \d\d\/\d\d$/u).first()).toBeVisible()
      await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined)
      await expect(page.locator('section[id^="coluna-"]').first()).toBeAttached({ timeout: 15_000 })
      const { totalDia, pendDia } = await page.evaluate(() => ({
        totalDia: [...document.querySelectorAll('section[id^="coluna-"] header span')].reduce((s, el) => s + Number(el.textContent?.match(/\d+/)?.[0] ?? 0), 0),
        pendDia: [...document.querySelectorAll('section[id^="coluna-"] button')].filter((a) => /pendente$/i.test(a.getAttribute('aria-label') ?? '')).length,
      }))
      expect(totalDia, `${nome} -> total no Dia`).toBe(totalSemana)
      expect(pendDia, `${nome} -> pendentes no Dia`).toBe(pendSemana)
      await semRolagem(page)
      await page.goBack()
      await expect(lista(page).getByRole('link')).toHaveCount(7, { timeout: 15_000 })
    }
    expect(erros.filter((e) => !/favicon/.test(e))).toEqual([])
  })

  test('semana atual: 768 e 1023px sem rolagem horizontal (dados reais)', async ({ page }) => {
    for (const w of [768, 1023]) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.goto('/painel?visao=semana')
      await expect(lista(page).getByRole('link')).toHaveCount(7, { timeout: 20_000 })
      await semRolagem(page)
    }
  })
})
