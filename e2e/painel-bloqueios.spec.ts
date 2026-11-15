import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// Criar e remover bloqueios no /painel (incremento 4.5).
// Login REAL com a conta da equipe (E2E_EMAIL/E2E_SENHA); os dados da agenda e as funções criar_bloqueio e
// remover_bloqueio são SIMULADOS com page.route, então nada é gravado no banco remoto. A simulação guarda os
// bloqueios em memória: criar adiciona, remover apaga, e o próximo listar_bloqueios já devolve o novo estado.
// O teste contra o banco de verdade está em painel-bloqueios-real.spec.ts.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

// ---------------------------------------------------------------
// Dias e dados simulados
// ---------------------------------------------------------------

const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()

const PASSADO = somarDias(hojeEmSP(), -3)
// Uma quarta-feira (funcionamento 09:00 às 20:00) daqui a pelo menos 3 dias: "Dia inteiro" vale 09:00 – 20:00.
const FUTURO = (() => {
  let d = somarDias(hojeEmSP(), 3)
  while (diaDaSemana(d) !== 3) d = somarDias(d, 1)
  return d
})()

const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
]

/** Instante em São Paulo (UTC-3, sem horário de verão desde 2019). */
const sp = (hhmm: string, dia: string) => `${dia}T${hhmm}:00-03:00`
/** O mesmo instante em UTC, como o formulário envia ao banco. */
const utc = (hhmm: string, dia: string) => new Date(sp(hhmm, dia)).toISOString()

interface LinhaBloqueio {
  id: string
  barbeiro_id: string | null
  barbeiro_nome: string | null
  inicio: string
  fim: string
  motivo: string
}

const BLOQUEIO_SEMENTE: LinhaBloqueio = {
  id: '20000000-0000-4000-8000-000000000001',
  barbeiro_id: B1,
  barbeiro_nome: 'Rafael',
  inicio: sp('14:00', FUTURO),
  fim: sp('16:00', FUTURO),
  motivo: 'Curso de navalha',
}

type Falha = { tipo: 'http'; status: number; code: string; message: string } | { tipo: 'rede' }

interface Simulacao {
  /** Corpo de cada chamada a criar_bloqueio, em ordem. */
  criadas: { p_barbeiro_id: string | null; p_inicio: string; p_fim: string; p_motivo: string }[]
  /** Id de cada chamada a remover_bloqueio. */
  removidas: string[]
  /** Quantas vezes os bloqueios foram buscados (listar_bloqueios). */
  buscas: () => number
  falharCriar: (falha: Falha | null) => void
  falharRemover: (falha: Falha | null) => void
  /** Atraso (ms) antes de responder criar_bloqueio. */
  atrasarCriar: (ms: number) => void
  /** Quantos agendamentos a função diz que já estavam dentro do período. */
  conflitos: (n: number) => void
  /** Apaga todos os bloqueios do servidor sem a tela saber (outra pessoa removeu). */
  esvaziar: () => void
}

async function simular(page: Page, iniciais: LinhaBloqueio[] = []): Promise<Simulacao> {
  const bloqueios = [...iniciais]
  const criadas: Simulacao['criadas'] = []
  const removidas: string[] = []
  let falhaCriar: Falha | null = null
  let falhaRemover: Falha | null = null
  let atrasoCriar = 0
  let nConflitos = 0
  let buscas = 0
  let proximoId = 100
  const json = (corpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
  const diaDe = (instante: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(instante))
  const falhou = (rota: Parameters<Parameters<Page['route']>[1]>[0], falha: Falha) =>
    falha.tipo === 'rede'
      ? rota.abort('failed')
      : rota.fulfill(json({ code: falha.code, message: falha.message, details: null, hint: null }, falha.status))

  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_agenda*', (rota) => rota.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => {
    const { p_de, p_ate } = rota.request().postDataJSON() as { p_de: string; p_ate: string }
    buscas++
    return rota.fulfill(json(bloqueios.filter((k) => diaDe(k.inicio) >= p_de && diaDe(k.inicio) <= p_ate)))
  })
  await page.route('**/rest/v1/rpc/criar_bloqueio*', async (rota) => {
    const corpo = rota.request().postDataJSON() as Simulacao['criadas'][number]
    criadas.push(corpo)
    if (atrasoCriar > 0) await new Promise((r) => setTimeout(r, atrasoCriar))
    if (falhaCriar) return falhou(rota, falhaCriar)
    const id = `20000000-0000-4000-8000-${String(proximoId++).padStart(12, '0')}`
    bloqueios.push({
      id,
      barbeiro_id: corpo.p_barbeiro_id,
      barbeiro_nome: BARBEIROS.find((b) => b.id === corpo.p_barbeiro_id)?.nome ?? null,
      inicio: corpo.p_inicio,
      fim: corpo.p_fim,
      motivo: corpo.p_motivo,
    })
    return rota.fulfill(json([{ id, conflitos: nConflitos }]))
  })
  await page.route('**/rest/v1/rpc/remover_bloqueio*', async (rota) => {
    const { p_id } = rota.request().postDataJSON() as { p_id: string }
    removidas.push(p_id)
    if (falhaRemover) return falhou(rota, falhaRemover)
    const i = bloqueios.findIndex((k) => k.id === p_id)
    if (i === -1) return rota.fulfill(json({ code: 'URB15', message: 'Bloqueio não encontrado.' }, 400))
    bloqueios.splice(i, 1)
    return rota.fulfill({ status: 204 })
  })
  return {
    criadas,
    removidas,
    buscas: () => buscas,
    falharCriar: (f) => {
      falhaCriar = f
    },
    falharRemover: (f) => {
      falhaRemover = f
    },
    atrasarCriar: (ms) => {
      atrasoCriar = ms
    },
    conflitos: (n) => {
      nConflitos = n
    },
    esvaziar: () => {
      bloqueios.length = 0
    },
  }
}

// ---------------------------------------------------------------
// Ajudas
// ---------------------------------------------------------------

const ehCelular = () => test.info().project.name === 'celular'
const dialogo = (page: Page) => page.getByRole('dialog')
const botaoBloquear = (page: Page) => page.getByRole('button', { name: 'Bloquear horário' })
/** Blocos de bloqueio na grade (CSS, para valer também com o diálogo aberto por cima). */
const blocos = (page: Page, trecho = '') =>
  page.locator(`section[id^="coluna-"] button[aria-label^="Bloqueio"]${trecho === '' ? '' : `[aria-label*="${trecho}"]`}`)

async function irPara(page: Page, dia: string) {
  await page.goto(`/painel?dia=${dia}`)
  await expect(botaoBloquear(page)).toBeEnabled()
}

async function abrirFormulario(page: Page) {
  await botaoBloquear(page).click()
  await expect(dialogo(page).getByRole('heading', { level: 2, name: 'Bloquear horário' })).toBeVisible()
}

/** Preenche o essencial: quem, início e fim (o dia fica no padrão: o dia aberto). */
async function preencher(page: Page, quem: string, inicio: string, fim: string) {
  const d = dialogo(page)
  await d.getByLabel('Quem').selectOption({ label: quem })
  await d.getByLabel('Início', { exact: true }).fill(inicio)
  await d.getByLabel('Fim', { exact: true }).fill(fim)
}

const enviar = (page: Page) => dialogo(page).getByRole('button', { name: /^(Bloquear|Salvando…)$/ })

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

// ---------------------------------------------------------------
// Abrir e fechar
// ---------------------------------------------------------------

test.describe('abrir e fechar pelo teclado', () => {
  test.beforeEach(async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
  })

  test('Enter abre; o foco vai ao primeiro campo; Esc fecha e o foco volta ao botão', async ({ page }) => {
    const botao = botaoBloquear(page)
    await botao.focus()
    await page.keyboard.press('Enter')
    await expect(dialogo(page)).toBeVisible()
    await expect(dialogo(page).getByLabel('Quem')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await expect(botao).toBeFocused()
  })

  test('espaço abre; o botão Fechar fecha e o foco volta ao botão', async ({ page }) => {
    const botao = botaoBloquear(page)
    await botao.focus()
    await page.keyboard.press('Space')
    await expect(dialogo(page)).toBeVisible()
    await dialogo(page).getByRole('button', { name: 'Fechar' }).click()
    await expect(dialogo(page)).toBeHidden()
    await expect(botao).toBeFocused()
  })

  test('clique no fundo escuro fecha; clique dentro do diálogo não', async ({ page }) => {
    await abrirFormulario(page)
    await dialogo(page).getByRole('heading', { level: 2 }).click()
    await expect(dialogo(page)).toBeVisible()
    await page.mouse.click(8, 8)
    await expect(dialogo(page)).toBeHidden()
    await expect(botaoBloquear(page)).toBeFocused()
  })

  test('o foco fica preso: o Tab e o Shift+Tab nunca saem do diálogo', async ({ page }) => {
    await abrirFormulario(page)
    const dentro = () => page.evaluate(() => document.activeElement?.closest('dialog') !== null)
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab')
      expect(await dentro()).toBe(true)
    }
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await dentro()).toBe(true)
    }
  })

  test('a página atrás fica sem rolagem; ao fechar a rolagem volta', async ({ page }) => {
    await abrirFormulario(page)
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  })

  test('reabrir depois de fechar mostra o formulário limpo', async ({ page }) => {
    await abrirFormulario(page)
    await dialogo(page).getByLabel(/^Motivo/).fill('Rascunho que não vale')
    await page.keyboard.press('Escape')
    await abrirFormulario(page)
    await expect(dialogo(page).getByLabel(/^Motivo/)).toHaveValue('')
    await expect(dialogo(page).getByLabel('Quem')).toHaveValue('')
  })
})

// ---------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------

test.describe('formulário', () => {
  test('campos: barbeiros e "Barbearia toda", dia padrão = dia aberto, sugestões de motivo', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await expect(d.getByLabel('Quem').locator('option')).toHaveText(['Escolha…', 'Barbearia toda', 'Rafael', 'Diego'])
    await expect(d.getByLabel('Dia', { exact: true })).toHaveValue(FUTURO)
    await expect(d.getByLabel('Início', { exact: true })).toHaveAttribute('type', 'time')
    await expect(d.getByLabel('Fim', { exact: true })).toHaveAttribute('type', 'time')
    for (const m of ['Folga', 'Compromisso', 'Almoço estendido']) {
      await expect(d.getByRole('button', { name: m, exact: true })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('sugestões de motivo: marcam, trocam, desmarcam, e aceitam texto livre depois', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    const motivo = d.getByLabel(/^Motivo/)
    const folga = d.getByRole('button', { name: 'Folga', exact: true })
    const compromisso = d.getByRole('button', { name: 'Compromisso', exact: true })
    await folga.click()
    await expect(motivo).toHaveValue('Folga')
    await expect(folga).toHaveAttribute('aria-pressed', 'true')
    await compromisso.click()
    await expect(motivo).toHaveValue('Compromisso')
    await expect(folga).toHaveAttribute('aria-pressed', 'false')
    await compromisso.click()
    await expect(motivo).toHaveValue('')
    await d.getByRole('button', { name: 'Almoço estendido', exact: true }).click()
    await expect(motivo).toHaveValue('Almoço estendido')
    await motivo.fill('Dentista às 15h')
    await expect(d.getByRole('button', { name: 'Almoço estendido', exact: true })).toHaveAttribute('aria-pressed', 'false')
  })

  test('o motivo é limitado a 120 caracteres (o que a função aceita)', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const motivo = dialogo(page).getByLabel(/^Motivo/)
    await expect(motivo).toHaveAttribute('maxlength', '120')
    await motivo.fill('a'.repeat(130))
    expect((await motivo.inputValue()).length).toBeLessThanOrEqual(120)
  })

  test('"Dia inteiro" preenche da abertura ao fechamento do dia', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await d.getByRole('button', { name: /Dia inteiro/ }).click()
    await expect(d.getByLabel('Início', { exact: true })).toHaveValue('09:00')
    await expect(d.getByLabel('Fim', { exact: true })).toHaveValue('20:00')
  })
})

test.describe('validação (conforto: o servidor valida de verdade)', () => {
  test('campos vazios: erro por campo, foco no primeiro e nada é enviado', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await enviar(page).click()

    await expect(d.getByText('Escolha o barbeiro ou "Barbearia toda".')).toBeVisible()
    await expect(d.getByText('Informe a hora de início.')).toBeVisible()
    await expect(d.getByText('Informe a hora de fim.')).toBeVisible()
    await expect(d.getByLabel('Quem')).toBeFocused()
    await expect(d.getByLabel('Quem')).toHaveAttribute('aria-invalid', 'true')
    await expect(d.getByLabel('Quem')).toHaveAccessibleDescription('Escolha o barbeiro ou "Barbearia toda".')
    await expect(d.getByLabel('Início', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(d.getByLabel('Dia', { exact: true })).toHaveAttribute('aria-invalid', 'false')
    expect(sim.criadas).toHaveLength(0)
    await expect(dialogo(page)).toBeVisible()
  })

  test('o erro some assim que o campo é corrigido; o foco vai ao primeiro campo com erro', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await d.getByLabel('Quem').selectOption({ label: 'Rafael' })
    await enviar(page).click()
    // Barbeiro está certo: o primeiro erro é o do início.
    await expect(d.getByLabel('Início', { exact: true })).toBeFocused()
    await d.getByLabel('Início', { exact: true }).fill('10:00')
    await expect(d.getByText('Informe a hora de início.')).toHaveCount(0)
    await expect(d.getByText('Informe a hora de fim.')).toBeVisible()
    await d.getByLabel('Fim', { exact: true }).fill('11:00')
    await expect(d.getByText('Informe a hora de fim.')).toHaveCount(0)
  })

  test('fim igual ou antes do início', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await preencher(page, 'Rafael', '12:00', '10:00')
    await enviar(page).click()
    await expect(d.getByText('O fim precisa ser depois do início.')).toBeVisible()
    await expect(d.getByLabel('Fim', { exact: true })).toBeFocused()
    await d.getByLabel('Fim', { exact: true }).fill('12:00')
    await expect(d.getByText('O fim precisa ser depois do início.')).toBeVisible()
    await d.getByLabel('Fim', { exact: true }).fill('12:15')
    await expect(d.getByText('O fim precisa ser depois do início.')).toHaveCount(0)
    expect(sim.criadas).toHaveLength(0)
  })

  test('dia que já passou: erro no fim', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await preencher(page, 'Rafael', '10:00', '11:00')
    await d.getByLabel('Dia', { exact: true }).fill(PASSADO)
    await enviar(page).click()
    await expect(d.getByText(/já passou/)).toBeVisible()
    expect(sim.criadas).toHaveLength(0)
    await d.getByLabel('Dia', { exact: true }).fill(FUTURO)
    await expect(d.getByText(/já passou/)).toHaveCount(0)
  })

  test('dia apagado: erro no dia', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    const d = dialogo(page)
    await preencher(page, 'Rafael', '10:00', '11:00')
    await d.getByLabel('Dia', { exact: true }).fill('')
    await enviar(page).click()
    await expect(d.getByText('Escolha o dia.')).toBeVisible()
    await expect(d.getByLabel('Dia', { exact: true })).toBeFocused()
  })
})

// ---------------------------------------------------------------
// Sucesso
// ---------------------------------------------------------------

test.describe('criar com sucesso', () => {
  test('manda o período certo em UTC, fecha, devolve o foco, anuncia e a grade mostra o bloqueio', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await expect(blocos(page)).toHaveCount(0)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '12:00')
    await dialogo(page).getByRole('button', { name: 'Folga', exact: true }).click()
    await enviar(page).click()

    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas).toEqual([
      { p_barbeiro_id: B1, p_inicio: utc('10:00', FUTURO), p_fim: utc('12:00', FUTURO), p_motivo: 'Folga' },
    ])
    await expect(botaoBloquear(page)).toBeFocused()
    // O aviso fica numa região aria-live sempre presente.
    const aviso = page.locator('[aria-live="polite"]', { hasText: 'Bloqueio criado' })
    await expect(aviso).toHaveText(/Bloqueio criado: Rafael, quarta, \d\d\/\d\d, 10:00 – 12:00\./)
    await expect(aviso).not.toContainText('Atenção')
    const bloco = blocos(page, 'Rafael: Folga')
    await expect(bloco).toHaveCount(1)
    await expect(bloco).toHaveAttribute('aria-label', 'Bloqueio, 10:00 – 12:00, Rafael: Folga')
    await expect(bloco).toBeVisible()
  })

  test('mostra "Salvando…" enquanto espera e o Esc não fecha nesse intervalo', async ({ page }) => {
    const sim = await simular(page)
    sim.atrasarCriar(900)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await preencher(page, 'Diego', '09:00', '10:00')
    await enviar(page).click()
    await expect(dialogo(page).getByRole('button', { name: 'Salvando…' })).toHaveAttribute('aria-disabled', 'true')
    await expect(dialogo(page).getByLabel('Quem')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeVisible()
    // Um segundo clique durante o salvamento não envia de novo.
    await dialogo(page).getByRole('button', { name: 'Salvando…' }).click({ force: true })
    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas).toHaveLength(1)
  })

  test('"Barbearia toda" manda barbeiro nulo e aparece em todas as colunas, marcada "Todos"', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await dialogo(page).getByLabel('Quem').selectOption({ label: 'Barbearia toda' })
    await dialogo(page).getByRole('button', { name: /Dia inteiro/ }).click()
    await dialogo(page).getByRole('button', { name: 'Almoço estendido', exact: true }).click()
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas[0]).toEqual({
      p_barbeiro_id: null,
      p_inicio: utc('09:00', FUTURO),
      p_fim: utc('20:00', FUTURO),
      p_motivo: 'Almoço estendido',
    })
    // Uma cópia por coluna (no celular só a aba aberta fica visível).
    await expect(blocos(page, 'toda a barbearia')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /Bloqueio, 09:00 – 20:00, toda a barbearia: Almoço estendido/ })).toHaveCount(
      ehCelular() ? 1 : 2,
    )
    await expect(blocos(page, 'toda a barbearia').first()).toContainText('Todos')
    await expect(page.locator('[aria-live="polite"]', { hasText: 'Bloqueio criado' })).toContainText('Barbearia toda')
  })

  test('sem motivo: a grade mostra "Bloqueado"', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '15:00', '15:30')
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas[0].p_motivo).toBe('')
    await expect(page.getByRole('button', { name: 'Bloqueio, 15:00 – 15:30, Rafael: Bloqueado' })).toBeVisible()
  })

  test('criar para outro dia: o aviso diz o dia e a grade de hoje não muda', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    const outro = somarDias(FUTURO, 1)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '11:00')
    await dialogo(page).getByLabel('Dia', { exact: true }).fill(outro)
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas[0].p_inicio).toBe(utc('10:00', outro))
    await expect(page.locator('[aria-live="polite"]', { hasText: 'Bloqueio criado' })).toContainText('quinta')
    await expect(blocos(page)).toHaveCount(0)
  })

  test('já havia agendamento no período: o aviso avisa e diz quantos', async ({ page }) => {
    const sim = await simular(page)
    sim.conflitos(2)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '12:00')
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    const aviso = page.locator('[aria-live="polite"]', { hasText: 'Bloqueio criado' })
    await expect(aviso).toContainText('Atenção: 2 agendamentos já estavam marcados')
    await expect(aviso).toContainText('continuam na agenda')
  })

  test('a agenda é buscada de novo depois de criar (para pegar o que outras pessoas fizeram)', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, FUTURO)
    const antes = sim.buscas()
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '12:00')
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antes)
    await expect(blocos(page, 'Rafael')).toHaveCount(1)
  })
})

// ---------------------------------------------------------------
// Erros: o diálogo continua aberto, com a mensagem em português
// ---------------------------------------------------------------

test.describe('erros ao criar', () => {
  const casos: { nome: string; falha: Falha; mensagem: RegExp }[] = [
    {
      nome: 'período inválido (URB12)',
      falha: { tipo: 'http', status: 400, code: 'URB12', message: 'Período do bloqueio inválido' },
      mensagem: /Período inválido\. O fim precisa ser depois do início/,
    },
    {
      nome: 'motivo longo (URB13)',
      falha: { tipo: 'http', status: 400, code: 'URB13', message: 'O motivo pode ter até 120 caracteres.' },
      mensagem: /O motivo é longo demais/,
    },
    {
      nome: 'barbeiro que não existe mais (URB14)',
      falha: { tipo: 'http', status: 400, code: 'URB14', message: 'Barbeiro não encontrado.' },
      mensagem: /Esse barbeiro não existe mais/,
    },
    {
      nome: 'sem permissão (42501)',
      falha: { tipo: 'http', status: 403, code: '42501', message: 'Acesso negado.' },
      mensagem: /Você não tem permissão/,
    },
    {
      nome: 'sessão vencida',
      falha: { tipo: 'http', status: 401, code: 'PGRST301', message: 'JWT expired' },
      mensagem: /Sua sessão expirou/,
    },
    { nome: 'falha de rede', falha: { tipo: 'rede' }, mensagem: /Sem conexão/ },
    {
      nome: 'erro desconhecido',
      falha: { tipo: 'http', status: 500, code: 'XX000', message: 'boom interno' },
      mensagem: /Não deu para salvar/,
    },
  ]

  for (const caso of casos) {
    test(`${caso.nome}: mensagem em português, diálogo aberto, dados mantidos, nova tentativa funciona`, async ({ page }) => {
      const sim = await simular(page)
      sim.falharCriar(caso.falha)
      await irPara(page, FUTURO)
      await abrirFormulario(page)
      await preencher(page, 'Rafael', '10:00', '12:00')
      await dialogo(page).getByLabel(/^Motivo/).fill('Folga do Rafael')
      await enviar(page).click()

      const alerta = dialogo(page).getByRole('alert')
      await expect(alerta).toHaveText(caso.mensagem)
      await expect(alerta).not.toContainText(/URB\d|PGRST|JWT|42501/)
      await expect(dialogo(page)).toBeVisible()
      // Nada foi perdido e o botão voltou a funcionar, com o foco nele.
      await expect(dialogo(page).getByLabel('Quem')).toHaveValue(B1)
      await expect(dialogo(page).getByLabel('Início', { exact: true })).toHaveValue('10:00')
      await expect(dialogo(page).getByLabel(/^Motivo/)).toHaveValue('Folga do Rafael')
      await expect(enviar(page)).toHaveText('Bloquear')
      await expect(enviar(page)).not.toHaveAttribute('aria-disabled', 'true')
      await expect(enviar(page)).toBeFocused()
      await expect(blocos(page)).toHaveCount(0)

      // Tentar de novo (o servidor voltou): dá certo e fecha.
      sim.falharCriar(null)
      await enviar(page).click()
      await expect(dialogo(page)).toBeHidden()
      await expect(blocos(page, 'Folga do Rafael')).toHaveCount(1)
      expect(sim.criadas).toHaveLength(2)
    })
  }

  test('a mensagem do erro some ao tentar de novo', async ({ page }) => {
    const sim = await simular(page)
    sim.falharCriar({ tipo: 'rede' })
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '12:00')
    await enviar(page).click()
    await expect(dialogo(page).getByRole('alert')).toBeVisible()
    sim.atrasarCriar(500)
    await enviar(page).click()
    await expect(dialogo(page).getByRole('alert')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------
// Abrir o bloqueio na grade e remover
// ---------------------------------------------------------------

test.describe('detalhes do bloqueio', () => {
  let sim: Simulacao
  test.beforeEach(async ({ page }) => {
    sim = await simular(page, [BLOQUEIO_SEMENTE])
    await irPara(page, FUTURO)
  })

  test('o bloco é um botão: Enter abre, mostra barbeiro, dia, período e motivo; Esc fecha e o foco volta ao bloco', async ({ page }) => {
    const bloco = blocos(page, 'Curso de navalha')
    await expect(bloco).toHaveAttribute('aria-haspopup', 'dialog')
    await bloco.focus()
    await page.keyboard.press('Enter')
    const d = dialogo(page)
    await expect(d.getByRole('heading', { level: 2, name: 'Bloqueio' })).toBeVisible()
    await expect(d.getByText('Rafael', { exact: true })).toBeVisible()
    await expect(d.getByText('14:00 – 16:00')).toBeVisible()
    await expect(d.getByText('Curso de navalha')).toBeVisible()
    await expect(d.getByText(/quarta, \d\d\/\d\d/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
    await expect(bloco).toBeFocused()
  })

  test('clique abre; o botão Fechar fecha e o foco volta ao bloco; o foco fica preso', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    await expect(dialogo(page)).toBeVisible()
    const dentro = () => page.evaluate(() => document.activeElement?.closest('dialog') !== null)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await dentro()).toBe(true)
    }
    await dialogo(page).getByRole('button', { name: 'Fechar' }).click()
    await expect(dialogo(page)).toBeHidden()
    await expect(blocos(page, 'Curso de navalha')).toBeFocused()
  })

  test('remover em 2 etapas: o 1º clique só pergunta, o 2º remove; fecha, anuncia e a grade perde o bloco', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    const d = dialogo(page)
    await d.getByRole('button', { name: 'Remover bloqueio' }).click()
    await expect(d.getByRole('status')).toContainText('Remover este bloqueio?')
    expect(sim.removidas).toHaveLength(0)
    await page.waitForTimeout(500)
    await d.getByRole('button', { name: 'Confirmar remoção?' }).click()

    await expect(d).toBeHidden()
    expect(sim.removidas).toEqual([BLOQUEIO_SEMENTE.id])
    await expect(blocos(page)).toHaveCount(0)
    await expect(page.locator('[aria-live="polite"]', { hasText: 'Bloqueio removido.' })).toBeVisible()
    // O bloco que abriu o diálogo não existe mais: o foco vai ao botão "Bloquear horário".
    await expect(botaoBloquear(page)).toBeFocused()
  })

  test('duplo toque no "Remover bloqueio" não remove (trava de 400 ms)', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    const botao = dialogo(page).getByRole('button', { name: 'Remover bloqueio' })
    // Dois cliques no mesmo instante, antes de a pergunta poder ser lida.
    await botao.evaluate((el) => {
      ;(el as HTMLButtonElement).click()
      ;(el as HTMLButtonElement).click()
    })
    const confirmar = dialogo(page).getByRole('button', { name: 'Confirmar remoção?' })
    await expect(confirmar).toBeVisible()
    await expect(confirmar).toHaveAttribute('aria-disabled', 'true')
    await page.waitForTimeout(200)
    expect(sim.removidas).toHaveLength(0)
    await expect(dialogo(page)).toBeVisible()
    await expect(confirmar).not.toHaveAttribute('aria-disabled', 'true', { timeout: 2000 })
  })

  test('Tab e Shift+Tab durante a trava de 400 ms não saem do diálogo', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    const botao = dialogo(page).getByRole('button', { name: 'Remover bloqueio' })
    // Abre a pergunta e confere a trava; os Tab seguintes acontecem em poucos ms, ainda dentro dos 400 ms.
    await botao.click()
    const fora = { travado: (await dialogo(page).locator('button[aria-disabled="true"]').count()) === 1 }
    expect(fora.travado).toBe(true)
    const dentro = () => page.evaluate(() => document.activeElement?.closest('dialog') !== null)
    // Pelo teclado de verdade, ainda dentro da trava (a trava dura 400 ms; o laço é rápido).
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i % 2 === 0 ? 'Tab' : 'Shift+Tab')
      expect(await dentro()).toBe(true)
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await dentro()).toBe(true)
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await dentro()).toBe(true)
    }
    expect(sim.removidas).toHaveLength(0)
  })

  test('"Voltar" desfaz a pergunta e o foco volta ao "Remover bloqueio"', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    const d = dialogo(page)
    await d.getByRole('button', { name: 'Remover bloqueio' }).click()
    await d.getByRole('button', { name: 'Voltar' }).click()
    await expect(d.getByRole('button', { name: 'Confirmar remoção?' })).toHaveCount(0)
    await expect(d.getByRole('button', { name: 'Remover bloqueio' })).toBeFocused()
    await expect(blocos(page)).toHaveCount(1)
  })

  test('erro ao remover: mensagem em português, diálogo aberto, bloco continua, foco no botão', async ({ page }) => {
    sim.falharRemover({ tipo: 'rede' })
    await blocos(page, 'Curso de navalha').click()
    const d = dialogo(page)
    await d.getByRole('button', { name: 'Remover bloqueio' }).click()
    await page.waitForTimeout(500)
    await d.getByRole('button', { name: 'Confirmar remoção?' }).click()
    await expect(d.getByRole('alert')).toHaveText(/Sem conexão/)
    await expect(d).toBeVisible()
    await expect(d.getByRole('button', { name: 'Remover bloqueio' })).toBeFocused()
    await expect(blocos(page)).toHaveCount(1)

    // Sem permissão
    sim.falharRemover({ tipo: 'http', status: 403, code: '42501', message: 'Acesso negado.' })
    await d.getByRole('button', { name: 'Remover bloqueio' }).click()
    await page.waitForTimeout(500)
    await d.getByRole('button', { name: 'Confirmar remoção?' }).click()
    await expect(d.getByRole('alert')).toHaveText(/Você não tem permissão/)
    await expect(d).toBeVisible()
  })

  test('alguém já removeu (URB15): a agenda é rebuscada e o diálogo fecha sem perder o foco', async ({ page }) => {
    await blocos(page, 'Curso de navalha').click()
    sim.esvaziar()
    const d = dialogo(page)
    await d.getByRole('button', { name: 'Remover bloqueio' }).click()
    await page.waitForTimeout(500)
    const antes = sim.buscas()
    await d.getByRole('button', { name: 'Confirmar remoção?' }).click()
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antes)
    // A busca mostra que o bloqueio não existe mais: o diálogo some junto com o bloco, e o foco não se perde.
    await expect(d).toBeHidden()
    await expect(blocos(page)).toHaveCount(0)
    await expect(botaoBloquear(page)).toBeFocused()
  })
})

// ---------------------------------------------------------------
// Layout
// ---------------------------------------------------------------

test.describe('layout', () => {
  test('o botão "Bloquear horário" cabe na tela e sem rolagem horizontal', async ({ page }) => {
    await simular(page, [BLOQUEIO_SEMENTE])
    await irPara(page, FUTURO)
    const caixa = (await botaoBloquear(page).boundingBox())!
    expect(caixa.x).toBeGreaterThanOrEqual(0)
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    await semRolagemHorizontal(page)
  })

  test('formulário: folha na base no celular (360px), painel na lateral no desktop; tudo dentro, sem rolagem horizontal', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    // A entrada desliza (transform): mede só depois de ela terminar.
    await dialogo(page).evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)))
    const caixa = (await dialogo(page).boundingBox())!
    const tela = page.viewportSize()!
    expect(caixa.x).toBeGreaterThanOrEqual(-1)
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(tela.width + 1)
    if (ehCelular()) {
      expect(tela.width).toBe(360)
      expect(caixa.width).toBeGreaterThanOrEqual(tela.width - 1)
      expect(Math.abs(caixa.y + caixa.height - tela.height)).toBeLessThanOrEqual(1)
      expect(caixa.height).toBeLessThanOrEqual(tela.height * 0.9 + 1)
    } else {
      expect(Math.abs(caixa.x + caixa.width - tela.width)).toBeLessThanOrEqual(1)
      expect(caixa.width).toBeGreaterThanOrEqual(400)
      expect(caixa.height).toBeGreaterThanOrEqual(tela.height - 1)
    }
    await semRolagemHorizontal(page)
    // Nenhum controle passa das bordas laterais do diálogo, e cada um tem pelo menos 44px de altura.
    const controles = dialogo(page).locator('button, input, select')
    for (const c of await controles.all()) {
      const b = (await c.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(caixa.x - 1)
      expect(b.x + b.width).toBeLessThanOrEqual(caixa.x + caixa.width + 1)
      expect(b.height).toBeGreaterThanOrEqual(43)
    }
    // O diálogo não tem rolagem lateral por dentro.
    const interno = await dialogo(page).evaluate((d) => d.scrollWidth <= d.clientWidth)
    expect(interno).toBe(true)
  })

  test('com os erros todos na tela o formulário continua sem rolagem horizontal', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await enviar(page).click()
    await expect(dialogo(page).getByText('Informe a hora de início.')).toBeVisible()
    await semRolagemHorizontal(page)
    const interno = await dialogo(page).evaluate((d) => d.scrollWidth <= d.clientWidth)
    expect(interno).toBe(true)
  })

  test('detalhes do bloqueio cabem em 360px, com motivo longo quebrando linha', async ({ page }) => {
    const longo = 'Curso '.repeat(19).trim() // 113 caracteres, com espaços
    await simular(page, [{ ...BLOQUEIO_SEMENTE, motivo: longo }])
    await irPara(page, FUTURO)
    await blocos(page).first().click()
    await expect(dialogo(page)).toBeVisible()
    await semRolagemHorizontal(page)
    const interno = await dialogo(page).evaluate((d) => d.scrollWidth <= d.clientWidth)
    expect(interno).toBe(true)
  })

  test('com movimento reduzido o formulário também aparece e funciona', async ({ page }) => {
    const sim = await simular(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await irPara(page, FUTURO)
    await abrirFormulario(page)
    await preencher(page, 'Rafael', '10:00', '11:00')
    await enviar(page).click()
    await expect(dialogo(page)).toBeHidden()
    expect(sim.criadas).toHaveLength(1)
  })
})

// ---------------------------------------------------------------
// Estados da agenda
// ---------------------------------------------------------------

test('com a agenda em erro, o botão fica desabilitado', async ({ page }) => {
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BARBEIROS) }))
  await page.route('**/rest/v1/rpc/listar_agenda*', (rota) =>
    rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
  )
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`/painel?dia=${FUTURO}`)
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  await expect(botaoBloquear(page)).toBeDisabled()
})
