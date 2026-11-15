import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// Visão da semana no /painel (incremento 4.3).
// Login REAL com a conta da equipe (E2E_EMAIL/E2E_SENHA); os dados da agenda são SIMULADOS com
// page.route em listar_agenda / listar_bloqueios / barbeiros. Nada é criado no banco remoto.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-semana')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

// ---------------------------------------------------------------
// Dados simulados: semana de segunda 02/11 a domingo 08/11/2026 (quarta 04/11 é o dia da URL)
// ---------------------------------------------------------------

const DIA = '2026-11-04'
const SEMANA = { de: '2026-11-02', ate: '2026-11-08' }
const ROTULO_SEMANA = '02/11 – 08/11'
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
  { id: B3, nome: 'Caio' },
]
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }

const sp = (dia: string, hhmm: string) => `${dia}T${hhmm}:00-03:00`

let contador = 0
function ag(barbeiro: string, dia: string, hhmm: string, status: string, cliente = 'Cliente') {
  contador++
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `S${String(contador).padStart(5, '0')}`,
    status,
    inicio: sp(dia, hhmm),
    fim: sp(dia, hhmm).replace(/T(\d\d):(\d\d)/, (_, h: string, m: string) => `T${h}:${String((Number(m) + 1) % 60).padStart(2, '0')}`),
    barbeiro_id: barbeiro,
    barbeiro_nome: NOME[barbeiro],
    servico_nome: 'Corte',
    servico_tipo: 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}

function bloqueio(barbeiro: string | null, inicio: string, fim: string, motivo: string) {
  contador++
  return {
    id: `20000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    barbeiro_id: barbeiro,
    barbeiro_nome: barbeiro === null ? null : NOME[barbeiro],
    inicio,
    fim,
    motivo,
  }
}

const AGENDA_DA_SEMANA = [
  // terça 03: 3 atendimentos, 1 pendente
  ag(B1, '2026-11-03', '09:00', 'confirmado'),
  ag(B1, '2026-11-03', '10:00', 'confirmado'),
  ag(B2, '2026-11-03', '11:00', 'pendente'),
  // quarta 04: 3 ativos (o cancelado não conta), 1 pendente
  ag(B1, '2026-11-04', '09:00', 'pendente'),
  ag(B1, '2026-11-04', '10:00', 'cancelado'),
  ag(B3, '2026-11-04', '14:00', 'confirmado'),
  ag(B3, '2026-11-04', '15:00', 'concluido'),
  // sexta 06 às 23:30 em SP (já é sábado em UTC): tem que ficar na sexta
  ag(B2, '2026-11-06', '23:30', 'confirmado'),
  // sábado 07
  ag(B1, '2026-11-07', '09:00', 'concluido'),
]
const BLOQUEIOS_DA_SEMANA = [
  bloqueio(null, sp('2026-11-04', '12:00'), sp('2026-11-04', '13:00'), 'Almoço da equipe'),
  // folga de sábado à tarde até domingo de manhã: toca sábado e domingo
  bloqueio(B3, sp('2026-11-07', '15:00'), sp('2026-11-08', '10:00'), 'Folga do Caio'),
]

interface Opcoes {
  barbeiros?: typeof BARBEIROS
  agenda?: (de: string, ate: string) => unknown[]
  bloqueios?: (de: string, ate: string) => unknown[]
  atraso?: (de: string) => number
  falhar?: (de: string) => boolean
}

/** Simula as três chamadas. Devolve os períodos pedidos a listar_agenda ("de..ate") e a listar_bloqueios. */
async function simular(page: Page, opcoes: Opcoes = {}) {
  const {
    barbeiros = BARBEIROS,
    agenda = (de) => (de === SEMANA.de ? AGENDA_DA_SEMANA : []),
    bloqueios = (de) => (de === SEMANA.de ? BLOQUEIOS_DA_SEMANA : []),
    atraso = () => 0,
    falhar = () => false,
  } = opcoes
  const pedidos: string[] = []
  const pedidosBloqueios: string[] = []
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })

  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json(barbeiros)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => {
    const { p_de, p_ate } = rota.request().postDataJSON() as { p_de: string; p_ate: string }
    pedidosBloqueios.push(`${p_de}..${p_ate}`)
    return rota.fulfill(json(bloqueios(p_de, p_ate)))
  })
  await page.route('**/rest/v1/rpc/listar_agenda*', async (rota) => {
    const { p_de, p_ate } = rota.request().postDataJSON() as { p_de: string; p_ate: string }
    pedidos.push(`${p_de}..${p_ate}`)
    const espera = atraso(p_de)
    if (espera > 0) await new Promise((r) => setTimeout(r, espera))
    if (falhar(p_de)) {
      return rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
    }
    return rota.fulfill(json(agenda(p_de, p_ate)))
  })
  return { pedidos, pedidosBloqueios }
}

// ---------------------------------------------------------------
// Ajudas
// ---------------------------------------------------------------

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

const ehCelular = () => test.info().project.name === 'celular'
const URL_SEMANA = `/painel?visao=semana&dia=${DIA}`
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
/** O link de um dia da semana, pelo nome acessível (ex.: dia('terça, 03/11')). */
const dia = (page: Page, rotulo: string) => page.getByRole('link', { name: new RegExp(`^${rotulo}`) })
const lista = (page: Page) => page.getByRole('list', { name: 'Dias da semana' })
const rotuloDaSemana = (page: Page, texto: string) => page.getByText(texto, { exact: true })

// ---------------------------------------------------------------
// Alternar Dia / Semana e URL
// ---------------------------------------------------------------

test.describe('alternar entre Dia e Semana', () => {
  test('começa no Dia; "Semana" guarda visao e dia na URL e busca a semana numa chamada só', async ({ page }) => {
    const { pedidos, pedidosBloqueios } = await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    const grupo = page.getByRole('group', { name: 'Visão da agenda' })
    await expect(grupo.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true')
    await expect(grupo.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')

    await grupo.getByRole('button', { name: 'Semana' }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]visao=semana&dia=${DIA}$`))
    await expect(grupo.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')
    await expect(grupo.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda da semana')
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await expect(lista(page).getByRole('listitem')).toHaveCount(7)
    // Um pedido do dia e UM pedido da semana inteira (segunda a domingo) para cada função.
    expect(pedidos).toEqual([`${DIA}..${DIA}`, `${SEMANA.de}..${SEMANA.ate}`])
    expect(pedidosBloqueios).toEqual([`${DIA}..${DIA}`, `${SEMANA.de}..${SEMANA.ate}`])
  })

  test('"Dia" volta à visão do dia, mantém o dia e tira visao da URL', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await page.getByRole('button', { name: 'Dia', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/painel\\?dia=${DIA}$`))
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
  })

  test('abre direto na semana pela URL e recarregar mantém a visão', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await page.reload()
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('o botão voltar do navegador volta da semana para o dia', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: 'Semana', exact: true }).click()
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await page.goBack()
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
  })

  test('visao desconhecida cai no Dia; semana sem ?dia usa hoje; dia inválido também', async ({ page }) => {
    const { pedidos } = await simular(page)
    await page.goto(`/painel?visao=mes&dia=${DIA}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')

    await page.goto('/painel?visao=semana&dia=lixo')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda da semana')
    await expect(page.getByText('Esta semana', { exact: true }).first()).toBeVisible()
    // O título troca antes de a semana ser pedida: espera o pedido de 7 dias (o do dia tem de = ate)
    // em vez de ler o último pedido cedo demais, que ainda seria o do dia.
    await expect.poll(() => pedidos.some((p) => p.split('..')[0] !== p.split('..')[1])).toBe(true)
    // O último pedido é a semana que contém hoje (segunda a domingo, 7 dias).
    const [de, ate] = pedidos.at(-1)!.split('..')
    expect(new Date(`${de}T12:00:00Z`).getUTCDay()).toBe(1)
    expect(new Date(`${ate}T12:00:00Z`).getUTCDay()).toBe(0)
    expect((Date.parse(ate) - Date.parse(de)) / 86400000).toBe(6)
    expect(de <= hojeEmSP() && hojeEmSP() <= ate).toBe(true)
  })
})

// ---------------------------------------------------------------
// Conteúdo dos dias
// ---------------------------------------------------------------

test.describe('os 7 dias', () => {
  test.beforeEach(async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await expect(lista(page)).toBeVisible()
  })

  test('segunda a domingo, em ordem, com data curta', async ({ page }) => {
    const links = lista(page).getByRole('link')
    await expect(links).toHaveCount(7)
    const esperado = ['segunda, 02/11', 'terça, 03/11', 'quarta, 04/11', 'quinta, 05/11', 'sexta, 06/11', 'sábado, 07/11', 'domingo, 08/11']
    for (const [i, rotulo] of esperado.entries()) {
      await expect(links.nth(i)).toHaveAccessibleName(new RegExp(`^${rotulo}`))
    }
    await expect(links.nth(0)).toContainText('seg')
    await expect(links.nth(0)).toContainText('02/11')
    await expect(links.nth(5)).toContainText('sáb')
  })

  test('total de ativos, pendentes e resumo por barbeiro', async ({ page }) => {
    const terca = dia(page, 'terça, 03/11')
    await expect(terca).toHaveAccessibleName(/3 atendimentos, 1 pendente$/)
    await expect(terca).toContainText('3')
    await expect(terca).toContainText('1 pendente')
    await expect(terca.locator('li').filter({ hasText: 'Rafael' })).toContainText('2')
    await expect(terca.locator('li').filter({ hasText: 'Diego' })).toContainText('1')
    await expect(terca.locator('li').filter({ hasText: 'Caio' })).toHaveCount(0)
  })

  test('cancelado não conta no total nem no resumo', async ({ page }) => {
    const quarta = dia(page, 'quarta, 04/11')
    // 4 agendamentos no dia, 1 cancelado: 3 ativos.
    await expect(quarta).toHaveAccessibleName(/3 atendimentos, 1 pendente, 1 bloqueio$/)
    await expect(quarta.locator('li').filter({ hasText: 'Rafael' })).toContainText('1')
    await expect(quarta.locator('li').filter({ hasText: 'Caio' })).toContainText('2')
  })

  test('dia sem atendimento diz que está livre; dias fechados aparecem como "Fechado"', async ({ page }) => {
    await expect(dia(page, 'quinta, 05/11')).toHaveAccessibleName(/sem atendimentos/)
    await expect(dia(page, 'quinta, 05/11')).toContainText('Sem atendimentos')
    for (const rotulo of ['segunda, 02/11', 'domingo, 08/11']) {
      await expect(dia(page, rotulo)).toHaveAccessibleName(/fechado/)
      await expect(dia(page, rotulo)).toContainText('Fechado')
    }
    await expect(dia(page, 'terça, 03/11')).not.toContainText('Fechado')
  })

  test('atendimento às 23:30 de SP fica na sexta, não no sábado', async ({ page }) => {
    await expect(dia(page, 'sexta, 06/11')).toHaveAccessibleName(/1 atendimento$/)
    await expect(dia(page, 'sexta, 06/11').locator('li').filter({ hasText: 'Diego' })).toContainText('1')
    await expect(dia(page, 'sábado, 07/11')).toHaveAccessibleName(/1 atendimento/)
    await expect(dia(page, 'sábado, 07/11').locator('li').filter({ hasText: 'Diego' })).toHaveCount(0)
  })

  test('bloqueios aparecem indicados, inclusive o que atravessa a noite', async ({ page }) => {
    await expect(dia(page, 'quarta, 04/11')).toContainText('1 bloqueio')
    await expect(dia(page, 'sábado, 07/11')).toContainText('1 bloqueio')
    await expect(dia(page, 'domingo, 08/11')).toContainText('1 bloqueio')
    await expect(dia(page, 'domingo, 08/11')).toHaveAccessibleName(/fechado.*1 bloqueio/)
    await expect(dia(page, 'segunda, 02/11')).not.toContainText('bloqueio')
    await expect(dia(page, 'quinta, 05/11')).not.toContainText('bloqueio')
    await expect(dia(page, 'quarta, 04/11').locator('.listras')).toHaveCSS('background-image', /repeating-linear-gradient/)
  })

  test('layout: 7 colunas lado a lado no desktop; lista vertical no celular; sem rolagem horizontal', async ({ page }) => {
    const caixas = []
    for (let i = 0; i < 7; i++) caixas.push((await lista(page).getByRole('listitem').nth(i).boundingBox())!)
    if (ehCelular()) {
      for (let i = 1; i < 7; i++) {
        expect(caixas[i].y).toBeGreaterThan(caixas[i - 1].y)
        expect(Math.abs(caixas[i].x - caixas[0].x)).toBeLessThanOrEqual(1)
      }
    } else {
      for (let i = 1; i < 7; i++) {
        expect(caixas[i].x).toBeGreaterThan(caixas[i - 1].x)
        expect(Math.abs(caixas[i].y - caixas[0].y)).toBeLessThanOrEqual(1)
      }
    }
    await semRolagemHorizontal(page)
  })
})

test('hoje fica em destaque (só ele) quando a semana mostrada é a atual', async ({ page }) => {
  await simular(page, { agenda: () => [], bloqueios: () => [] })
  await page.goto('/painel?visao=semana')
  await expect(lista(page)).toBeVisible()
  await expect(lista(page).getByRole('link')).toHaveCount(7)
  await expect(lista(page).locator('a[aria-current="date"]')).toHaveCount(1)
  await expect(lista(page).locator('a[aria-current="date"]')).toHaveAccessibleName(/, hoje,/)
  await expect(page.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-current', 'date')
})

test('semana que não é a atual não destaca nenhum dia', async ({ page }) => {
  await simular(page)
  await page.goto(URL_SEMANA)
  await expect(lista(page)).toBeVisible()
  await expect(lista(page).locator('a[aria-current="date"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Esta semana' })).not.toHaveAttribute('aria-current', 'date')
})

// ---------------------------------------------------------------
// Clicar num dia abre a visão Dia
// ---------------------------------------------------------------

test.describe('abrir um dia', () => {
  test('clicar leva à visão Dia daquele dia', async ({ page }) => {
    const { pedidos } = await simular(page, { agenda: (de) => (de === SEMANA.de ? AGENDA_DA_SEMANA : []) })
    await page.goto(URL_SEMANA)
    await dia(page, 'terça, 03/11').click()
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-03$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
    await expect(page.getByText('terça, 03/11')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => pedidos.at(-1)).toBe('2026-11-03..2026-11-03')
  })

  test('Enter num dia focado abre a visão Dia', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    const quinta = dia(page, 'quinta, 05/11')
    await quinta.focus()
    await expect(quinta).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-05$/)
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
  })

  test('ao abrir um dia, o foco vai para o título e a página volta ao topo', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    const ultimo = dia(page, 'domingo, 08/11')
    await ultimo.scrollIntoViewIfNeeded()
    await ultimo.click()
    const titulo = page.getByRole('heading', { level: 1, name: 'Agenda do dia' })
    await expect(titulo).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    // O título é focável por código, mas não entra na ordem do Tab.
    await expect(titulo).toHaveAttribute('tabindex', '-1')
  })

  test('o foco também vai para o título ao abrir o dia com Enter', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await dia(page, 'sábado, 07/11').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeFocused()
  })

  test('o foco no título não se repete: ao recarregar, ao abrir a página direto e ao voltar', async ({ page }) => {
    await simular(page)
    // Abrir o Dia direto pela URL não rouba o foco.
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')

    // Vindo da semana: foca uma vez e limpa o state do histórico.
    await page.goto(URL_SEMANA)
    await dia(page, 'terça, 03/11').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeFocused()
    expect(await page.evaluate(() => (history.state as { usr?: unknown } | null)?.usr ?? null)).toBeNull()

    // Recarregar a página não refoca.
    await page.reload()
    await expect(page.getByText('terça, 03/11')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')

    // Voltar à semana e avançar de novo para o dia também não refoca.
    await page.goBack()
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await page.goForward()
    await expect(page.getByText('terça, 03/11')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
  })

  test('dá para chegar aos dias só com Tab, em ordem', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await expect(lista(page)).toBeVisible()
    await dia(page, 'segunda, 02/11').focus()
    await page.keyboard.press('Tab')
    await expect(dia(page, 'terça, 03/11')).toBeFocused()
  })

  test('dia fechado também abre', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await dia(page, 'domingo, 08/11').click()
    await expect(page).toHaveURL(/\/painel\?dia=2026-11-08$/)
    await expect(page.getByText('A barbearia não abre neste dia.')).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Navegação entre semanas
// ---------------------------------------------------------------

test.describe('navegação entre semanas', () => {
  test('anterior, próxima e esta semana atualizam rótulo, URL e a busca (uma chamada por semana)', async ({ page }) => {
    const { pedidos } = await simular(page)
    await page.goto(URL_SEMANA)
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()

    await page.getByRole('button', { name: 'Próxima semana' }).click()
    await expect(rotuloDaSemana(page, '09/11 – 15/11')).toBeVisible()
    await expect(page).toHaveURL(/[?&]visao=semana&dia=2026-11-11$/)
    await expect(page.getByText('Nenhum agendamento nesta semana.')).toBeVisible()

    await page.getByRole('button', { name: 'Semana anterior' }).click()
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await page.getByRole('button', { name: 'Semana anterior' }).click()
    await expect(rotuloDaSemana(page, '26/10 – 01/11')).toBeVisible()
    await expect(page).toHaveURL(/[?&]visao=semana&dia=2026-10-28$/)

    await page.getByRole('button', { name: 'Esta semana' }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]visao=semana&dia=${hojeEmSP()}$`))
    await expect(page.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-current', 'date')
    await expect
      .poll(() => pedidos.length)
      .toBe(5)
    expect(pedidos.slice(0, 4)).toEqual([
      '2026-11-02..2026-11-08',
      '2026-11-09..2026-11-15',
      '2026-11-02..2026-11-08',
      '2026-10-26..2026-11-01',
    ])
    await semRolagemHorizontal(page)
  })

  test('virada de ano: a semana de 31/12 vai de 28/12 a 03/01 e pede esse período inteiro', async ({ page }) => {
    const { pedidos } = await simular(page, { agenda: () => [], bloqueios: () => [] })
    await page.goto('/painel?visao=semana&dia=2026-12-31')
    await expect(rotuloDaSemana(page, '28/12 – 03/01')).toBeVisible()
    await expect(lista(page).getByRole('link')).toHaveCount(7)
    await expect(dia(page, 'sexta, 01/01')).toBeVisible()
    expect(pedidos).toEqual(['2026-12-28..2027-01-03'])
  })

  test('nas pontas do calendário os botões ficam desabilitados', async ({ page }) => {
    const { pedidos } = await simular(page, { agenda: () => [], bloqueios: () => [] })
    await page.goto('/painel?visao=semana&dia=9999-12-31')
    await expect(page.getByRole('button', { name: 'Próxima semana' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Semana anterior' })).toBeEnabled()
    await expect(lista(page).getByRole('link')).toHaveCount(5)
    expect(pedidos).toEqual(['9999-12-27..9999-12-31'])
  })

  test('resposta atrasada de uma semana não sobrescreve a semana escolhida depois', async ({ page }) => {
    await simular(page, {
      agenda: (de) => (de === SEMANA.de ? AGENDA_DA_SEMANA : [ag(B1, '2026-11-10', '09:00', 'pendente')]),
      bloqueios: () => [],
      atraso: (de) => (de === SEMANA.de ? 1500 : 0),
    })
    await page.goto(URL_SEMANA)
    await page.getByRole('button', { name: 'Próxima semana' }).click()
    await expect(dia(page, 'terça, 10/11')).toHaveAccessibleName(/1 atendimento, 1 pendente/)
    await page.waitForTimeout(2000)
    await expect(rotuloDaSemana(page, '09/11 – 15/11')).toBeVisible()
    await expect(dia(page, 'terça, 10/11')).toHaveAccessibleName(/1 atendimento, 1 pendente/)
    await expect(dia(page, 'terça, 03/11')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------
// Estados
// ---------------------------------------------------------------

test.describe('estados da tela', () => {
  test('carregando: aviso, navegação ativa, depois os dias', async ({ page }) => {
    await simular(page, { atraso: () => 1200 })
    await page.goto(URL_SEMANA)
    await expect(page.getByRole('status')).toHaveText('Carregando a agenda')
    await expect(page.getByRole('button', { name: 'Próxima semana' })).toBeEnabled()
    await semRolagemHorizontal(page)
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(lista(page).getByRole('link')).toHaveCount(7)
  })

  test('vazio: avisa e ainda mostra os 7 dias', async ({ page }) => {
    await simular(page, { agenda: () => [], bloqueios: () => [] })
    await page.goto(URL_SEMANA)
    await expect(page.getByText('Nenhum agendamento nesta semana.')).toBeVisible()
    await expect(lista(page).getByRole('link')).toHaveCount(7)
    await semRolagemHorizontal(page)
  })

  test('só bloqueio na semana não conta como vazia', async ({ page }) => {
    await simular(page, { agenda: () => [], bloqueios: () => BLOQUEIOS_DA_SEMANA })
    await page.goto(URL_SEMANA)
    await expect(lista(page)).toBeVisible()
    await expect(page.getByText('Nenhum agendamento nesta semana.')).toHaveCount(0)
    await expect(dia(page, 'quarta, 04/11')).toContainText('1 bloqueio')
  })

  test('erro: alerta e "Tentar de novo" busca outra vez', async ({ page }) => {
    let quebrar = true
    const { pedidos } = await simular(page, { falhar: () => quebrar })
    await page.goto(URL_SEMANA)
    await expect(page.getByRole('alert')).toContainText('Não deu para carregar a agenda.')
    await expect(lista(page)).toHaveCount(0)
    await semRolagemHorizontal(page)

    quebrar = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(dia(page, 'terça, 03/11')).toBeVisible()
    expect(pedidos).toEqual([`${SEMANA.de}..${SEMANA.ate}`, `${SEMANA.de}..${SEMANA.ate}`])
  })

  test('sem sessão: o formulário aparece e a semana não é pedida', async ({ browser }) => {
    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } })
    const page = await contexto.newPage()
    const { pedidos } = await simular(page)
    await page.goto(URL_SEMANA)
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(lista(page)).toHaveCount(0)
    expect(pedidos).toEqual([])
    await contexto.close()
  })
})

// ---------------------------------------------------------------
// Atualização silenciosa
// ---------------------------------------------------------------

test.describe('atualização silenciosa', () => {
  const vigiarPiscada = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __piscou: boolean }
      w.__piscou = false
      new MutationObserver(() => {
        if (document.querySelector('[role=status]')) w.__piscou = true
      }).observe(document.body, { childList: true, subtree: true })
    })
  const piscou = (page: Page) => page.evaluate(() => (window as unknown as { __piscou: boolean }).__piscou)
  const voltarParaAAba = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  test('ao voltar para a aba, a semana se atualiza sem passar por "carregando"', async ({ page }) => {
    let versao = 0
    const { pedidos } = await simular(page, {
      agenda: () => (versao === 0 ? AGENDA_DA_SEMANA : [...AGENDA_DA_SEMANA, ag(B1, '2026-11-05', '10:00', 'pendente')]),
    })
    await page.goto(URL_SEMANA)
    await expect(dia(page, 'quinta, 05/11')).toHaveAccessibleName(/sem atendimentos/)
    await vigiarPiscada(page)

    versao = 1
    await voltarParaAAba(page)
    await expect(dia(page, 'quinta, 05/11')).toHaveAccessibleName(/1 atendimento, 1 pendente/)
    expect(pedidos).toHaveLength(2)
    expect(await piscou(page)).toBe(false)
  })

  test('se a atualização silenciosa falhar, a semana fica como estava e não aparece erro', async ({ page }) => {
    let quebrar = false
    const { pedidos } = await simular(page, { falhar: () => quebrar })
    await page.goto(URL_SEMANA)
    await expect(dia(page, 'terça, 03/11')).toHaveAccessibleName(/3 atendimentos/)
    await vigiarPiscada(page)

    quebrar = true
    await voltarParaAAba(page)
    await expect.poll(() => pedidos.length).toBe(2)
    await page.waitForTimeout(300)
    await expect(dia(page, 'terça, 03/11')).toHaveAccessibleName(/3 atendimentos/)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await piscou(page)).toBe(false)
  })

  test('a cada 60 s a semana se atualiza sozinha', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install()
    let versao = 0
    const { pedidos } = await simular(page, {
      agenda: () => (versao === 0 ? AGENDA_DA_SEMANA : [...AGENDA_DA_SEMANA, ag(B1, '2026-11-05', '10:00', 'pendente')]),
    })
    await page.goto(URL_SEMANA)
    await expect(dia(page, 'quinta, 05/11')).toHaveAccessibleName(/sem atendimentos/)
    expect(pedidos).toHaveLength(1)

    versao = 1
    await page.clock.fastForward(60_000)
    await expect(dia(page, 'quinta, 05/11')).toHaveAccessibleName(/1 atendimento, 1 pendente/)
    expect(pedidos).toHaveLength(2)
  })
})

// ---------------------------------------------------------------
// Fuso
// ---------------------------------------------------------------

test.describe('fuso do navegador diferente de São Paulo', () => {
  test.use({ timezoneId: 'Pacific/Auckland' })

  test('semana e dia de cada atendimento continuam em America/Sao_Paulo', async ({ page }) => {
    await simular(page)
    await page.goto(URL_SEMANA)
    await expect(rotuloDaSemana(page, ROTULO_SEMANA)).toBeVisible()
    await expect(dia(page, 'sexta, 06/11')).toHaveAccessibleName(/1 atendimento/)
    await expect(dia(page, 'sábado, 07/11').locator('li').filter({ hasText: 'Diego' })).toHaveCount(0)
  })
})
