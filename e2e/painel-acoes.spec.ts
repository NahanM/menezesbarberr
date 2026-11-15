import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// Detalhes e ações do agendamento no /painel (incremento 4.4).
// Login REAL com a conta da equipe (E2E_EMAIL/E2E_SENHA); os dados da agenda e a função mudar_status
// são SIMULADOS com page.route, então nada é gravado no banco remoto. A agenda simulada guarda o
// estado em memória: mudar_status altera a linha e o próximo listar_agenda já devolve o novo status.
//
// "Agora" é o relógio real. Para o teste não depender da hora em que roda, usamos dois dias:
// um PASSADO (todo atendimento já começou) e um FUTURO (nenhum começou).

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
const PASSADO = somarDias(hojeEmSP(), -3)
const FUTURO = somarDias(hojeEmSP(), 3)

const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
]

/** Instante em São Paulo (UTC-3, sem horário de verão desde 2019). */
const sp = (hhmm: string, dia: string) => `${dia}T${hhmm}:00-03:00`

interface Linha {
  id: string
  codigo: string
  status: string
  inicio: string
  fim: string
  barbeiro_id: string
  barbeiro_nome: string
  servico_nome: string
  servico_tipo: string
  cliente_nome: string
  cliente_telefone: string
}

// Tudo no Rafael (primeira aba no celular), em horários que não se sobrepõem.
const CLIENTES = [
  { nome: 'Ana Pendente', status: 'pendente', de: '09:00', ate: '09:40', servico: 'Corte', tel: '5511999990000' },
  { nome: 'Bruno Confirmado', status: 'confirmado', de: '10:00', ate: '11:00', servico: 'Combo Essencial', tel: '551133334444' },
  { nome: 'Carla Concluida', status: 'concluido', de: '11:00', ate: '11:30', servico: 'Barba', tel: '5511988887777' },
  { nome: 'Davi Cancelado', status: 'cancelado', de: '12:00', ate: '12:40', servico: 'Corte', tel: '5511988887777' },
  { nome: 'Edu Faltou', status: 'nao_compareceu', de: '13:00', ate: '13:30', servico: 'Barba', tel: '5511988887777' },
  { nome: 'João & Maria', status: 'pendente', de: '14:00', ate: '14:40', servico: 'Corte', tel: '5511977776666' },
]

function linhasDoDia(dia: string): Linha[] {
  return CLIENTES.map((c, i) => ({
    // 12 dígitos finais: o dia (8) e a posição na lista (4).
    id: `10000000-0000-4000-8000-${dia.replaceAll('-', '')}${String(i + 1).padStart(4, '0')}`,
    codigo: `K${String(i + 1).padStart(3, '0')}XZ`,
    status: c.status,
    inicio: sp(c.de, dia),
    fim: sp(c.ate, dia),
    barbeiro_id: B1,
    barbeiro_nome: 'Rafael',
    servico_nome: c.servico,
    servico_tipo: 'avulso',
    cliente_nome: c.nome,
    cliente_telefone: c.tel,
  }))
}

// Mesmas transições do trigger do banco.
const PERMITIDAS: Record<string, string[]> = {
  pendente: ['confirmado', 'cancelado'],
  confirmado: ['concluido', 'cancelado', 'nao_compareceu'],
}

type Falha = { tipo: 'http'; status: number; code: string; message: string } | { tipo: 'rede' }

interface Simulacao {
  /** Corpo de cada chamada a mudar_status, em ordem. */
  chamadas: { p_id: string; p_status: string }[]
  /** Quantas vezes a agenda foi buscada (listar_agenda). */
  buscas: () => number
  /** Muda como a próxima chamada a mudar_status responde. */
  falhar: (falha: Falha | null) => void
  /** Atraso (ms) antes de responder mudar_status. */
  atrasar: (ms: number) => void
}

async function simular(page: Page): Promise<Simulacao> {
  const estado = new Map<string, Linha>()
  for (const dia of [PASSADO, FUTURO]) for (const l of linhasDoDia(dia)) estado.set(l.id, l)
  const chamadas: Simulacao['chamadas'] = []
  let falha: Falha | null = null
  let atraso = 0
  let buscas = 0
  const json = (corpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo) })

  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => rota.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', (rota) => {
    const { p_de } = rota.request().postDataJSON() as { p_de: string }
    buscas++
    return rota.fulfill(json([...estado.values()].filter((l) => l.inicio.startsWith(p_de))))
  })
  await page.route('**/rest/v1/rpc/mudar_status*', async (rota) => {
    const corpo = rota.request().postDataJSON() as { p_id: string; p_status: string }
    chamadas.push(corpo)
    if (atraso > 0) await new Promise((r) => setTimeout(r, atraso))
    if (falha?.tipo === 'rede') return rota.abort('failed')
    if (falha?.tipo === 'http') {
      return rota.fulfill(json({ code: falha.code, message: falha.message, details: null, hint: null }, falha.status))
    }
    const linha = estado.get(corpo.p_id)
    if (!linha) return rota.fulfill(json({ code: 'URB11', message: 'Agendamento não encontrado.' }, 400))
    if (!PERMITIDAS[linha.status]?.includes(corpo.p_status)) {
      return rota.fulfill(json({ code: '23514', message: `Transição de status inválida: ${linha.status} -> ${corpo.p_status}` }, 400))
    }
    linha.status = corpo.p_status
    return rota.fulfill(json([linha]))
  })
  return {
    chamadas,
    buscas: () => buscas,
    falhar: (f) => {
      falha = f
    },
    atrasar: (ms) => {
      atraso = ms
    },
  }
}

// ---------------------------------------------------------------
// Ajudas
// ---------------------------------------------------------------

const ehCelular = () => test.info().project.name === 'celular'
/** O bloco da grade (botão), mesmo com o diálogo aberto por cima (a página fica inerte, mas o botão existe). */
const bloco = (page: Page, nome: string) => page.locator(`section[id^="coluna-"] button[aria-label*="${nome}"]`)
const dialogo = (page: Page) => page.getByRole('dialog')
// O botão "Cancelar" tem nome acessível "Cancelar agendamento" (o texto na tela continua "Cancelar").
const botaoDoDialogo = (page: Page, nome: string | RegExp) =>
  dialogo(page).getByRole('button', { name: nome === 'Cancelar' ? 'Cancelar agendamento' : nome, exact: typeof nome === 'string' })

// `cancelados`: desde o F9 o cancelado fica fora da grade por padrão; true liga o filtro (?cancelados=1).
async function irPara(page: Page, dia: string, cancelados = false) {
  await page.goto(`/painel?dia=${dia}${cancelados ? '&cancelados=1' : ''}`)
  await expect(bloco(page, 'Ana Pendente')).toBeVisible({ timeout: 20_000 }) // 1ª carga sob 3 workers pode passar de 5 s
}

async function abrir(page: Page, nome: string) {
  await bloco(page, nome).click()
  await expect(dialogo(page)).toBeVisible()
  await expect(dialogo(page).getByRole('heading', { level: 2, name: nome })).toBeVisible()
}

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

/** Nomes (texto) dos botões de ação do diálogo, sem o "Fechar" nem o "Voltar" da confirmação. */
async function acoes(page: Page): Promise<string[]> {
  const nomes = await dialogo(page).getByRole('button').allTextContents()
  return nomes.map((n) => n.trim()).filter((n) => n !== 'Fechar' && n !== 'Voltar')
}

// ---------------------------------------------------------------
// Abrir e fechar
// ---------------------------------------------------------------

test.describe('abrir e fechar', () => {
  test.beforeEach(async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
  })

  test('Enter abre; Esc fecha e o foco volta ao bloco', async ({ page }) => {
    const ana = bloco(page, 'Ana Pendente')
    await ana.focus()
    await page.keyboard.press('Enter')
    await expect(dialogo(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await expect(ana).toBeFocused()
  })

  test('espaço abre; o botão Fechar fecha e o foco volta ao bloco', async ({ page }) => {
    const bruno = bloco(page, 'Bruno Confirmado')
    await bruno.focus()
    await page.keyboard.press('Space')
    await expect(dialogo(page)).toBeVisible()
    await botaoDoDialogo(page, 'Fechar').click()
    await expect(dialogo(page)).toBeHidden()
    await expect(bruno).toBeFocused()
  })

  test('clique abre; clique no fundo escuro fecha e o foco volta ao bloco', async ({ page }) => {
    await abrir(page, 'Ana Pendente')
    await page.mouse.click(8, 8)
    await expect(dialogo(page)).toBeHidden()
    await expect(bloco(page, 'Ana Pendente')).toBeFocused()
  })

  test('clique dentro do diálogo não fecha', async ({ page }) => {
    await abrir(page, 'Ana Pendente')
    await dialogo(page).getByRole('heading', { level: 2 }).click()
    await expect(dialogo(page)).toBeVisible()
  })

  test('o foco começa dentro do diálogo e o Tab não escapa dele', async ({ page }) => {
    await abrir(page, 'Ana Pendente')
    const dentro = () => page.evaluate(() => document.activeElement?.closest('dialog') !== null)
    expect(await dentro()).toBe(true)
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      expect(await dentro()).toBe(true)
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await dentro()).toBe(true)
    }
  })

  test('a página atrás fica inerte e sem rolagem', async ({ page }) => {
    await abrir(page, 'Ana Pendente')
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    // Clicar num bloco de trás não faz nada (nem abre outro diálogo).
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  })

  test('abrir de novo depois de fechar funciona, com outro agendamento', async ({ page }) => {
    await abrir(page, 'Ana Pendente')
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await abrir(page, 'Bruno Confirmado')
    await expect(dialogo(page).getByRole('heading', { level: 2 })).toHaveText('Bruno Confirmado')
  })

  test('com movimento reduzido o diálogo também aparece', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrir(page, 'Ana Pendente')
    await expect(botaoDoDialogo(page, 'Confirmar')).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------

test.describe('detalhes', () => {
  test('mostra cliente, telefone formatado, serviço, barbeiro, dia, hora, código e status', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const d = dialogo(page)
    const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
      .format(new Date(`${PASSADO}T12:00:00Z`))
      .replace(/-feira$/, '')
    const [, mm, dd] = PASSADO.split('-')
    await expect(d.getByText('(11) 99999-0000')).toBeVisible()
    await expect(d.getByText('Corte', { exact: true })).toBeVisible()
    await expect(d.getByText('Rafael', { exact: true })).toBeVisible()
    await expect(d.getByText(`${diaSemana}, ${dd}/${mm}`, { exact: true })).toBeVisible()
    await expect(d.getByText('09:00 – 09:40')).toBeVisible()
    await expect(d.getByText('K001XZ')).toBeVisible()
    await expect(d.getByText('Pendente', { exact: true })).toBeVisible()
  })

  test('telefone fixo de 12 dígitos também sai formatado', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    await expect(dialogo(page).getByText('(11) 3333-4444')).toBeVisible()
  })

  test('posição: folha na base no celular, painel na lateral direita no desktop; sem rolagem horizontal', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    // A entrada desliza (transform): mede só depois de ela terminar.
    await dialogo(page).evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)))
    const caixa = (await dialogo(page).boundingBox())!
    const tela = page.viewportSize()!
    expect(caixa.x).toBeGreaterThanOrEqual(-1)
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(tela.width + 1)
    if (ehCelular()) {
      expect(caixa.width).toBeGreaterThanOrEqual(tela.width - 1)
      expect(Math.abs(caixa.y + caixa.height - tela.height)).toBeLessThanOrEqual(1)
      expect(caixa.height).toBeLessThanOrEqual(tela.height * 0.9 + 1)
    } else {
      expect(Math.abs(caixa.x + caixa.width - tela.width)).toBeLessThanOrEqual(1)
      expect(caixa.width).toBeGreaterThanOrEqual(400)
      expect(caixa.height).toBeGreaterThanOrEqual(tela.height - 1)
    }
    await semRolagemHorizontal(page)
    // Nenhum botão do diálogo passa da borda.
    for (const b of await dialogo(page).getByRole('button').all()) {
      const bb = (await b.boundingBox())!
      expect(bb.x).toBeGreaterThanOrEqual(caixa.x - 1)
      expect(bb.x + bb.width).toBeLessThanOrEqual(caixa.x + caixa.width + 1)
    }
  })

  test('nome longo quebra linha e não estoura o diálogo', async ({ page }) => {
    const longo = 'Maximiliano Montenegro de Albuquerque Cavalcanti Sobrenomegigantesco'
    await simular(page)
    await page.route('**/rest/v1/rpc/listar_agenda*', (rota) => {
      const { p_de } = rota.request().postDataJSON() as { p_de: string }
      const l = linhasDoDia(p_de)[0]
      return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...l, cliente_nome: longo }]) })
    })
    await page.goto(`/painel?dia=${PASSADO}`)
    await bloco(page, 'Maximiliano').click()
    await expect(dialogo(page)).toBeVisible()
    await semRolagemHorizontal(page)
    const { sobra } = await dialogo(page).evaluate((d) => ({ sobra: d.scrollWidth - d.clientWidth }))
    expect(sobra).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------
// Ações conforme status e horário
// ---------------------------------------------------------------

test.describe('quais ações aparecem', () => {
  test('dia passado (tudo já começou)', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO, true) // "Davi Cancelado" só está na grade com o filtro ligado
    const esperado: Record<string, string[]> = {
      'Ana Pendente': ['Confirmar', 'Cancelar'],
      'Bruno Confirmado': ['Concluir', 'Não compareceu', 'Cancelar'],
      'Carla Concluida': [],
      'Davi Cancelado': [],
      'Edu Faltou': [],
    }
    for (const [nome, lista] of Object.entries(esperado)) {
      await abrir(page, nome)
      expect(await acoes(page), nome).toEqual(lista)
      // O WhatsApp está sempre disponível, qualquer que seja o status.
      await expect(dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialogo(page)).toBeHidden()
    }
  })

  test('dia futuro: confirmado só pode ser cancelado; pendente segue com as duas', async ({ page }) => {
    await simular(page)
    await irPara(page, FUTURO)
    await abrir(page, 'Bruno Confirmado')
    expect(await acoes(page)).toEqual(['Cancelar'])
    await page.keyboard.press('Escape')
    await abrir(page, 'Ana Pendente')
    expect(await acoes(page)).toEqual(['Confirmar', 'Cancelar'])
  })

  test('só a ação principal é neon; cancelar e faltou não usam o neon', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    const fundo = (nome: string) => botaoDoDialogo(page, nome).evaluate((b) => getComputedStyle(b).backgroundColor)
    expect(await fundo('Concluir')).toBe('rgb(212, 253, 1)')
    expect(await fundo('Não compareceu')).not.toBe('rgb(212, 253, 1)')
    expect(await fundo('Cancelar')).not.toBe('rgb(212, 253, 1)')
  })
})

// ---------------------------------------------------------------
// Confirmação em duas etapas
// ---------------------------------------------------------------

test.describe('duas etapas para cancelar e para faltou', () => {
  test('cancelar: o 1º clique só pergunta; o 2º executa', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')

    await botaoDoDialogo(page, 'Cancelar').click()
    await expect(botaoDoDialogo(page, 'Confirmar cancelamento?')).toBeVisible()
    await expect(dialogo(page).getByRole('status')).toContainText('Toque de novo para confirmar')
    expect(sim.chamadas).toHaveLength(0)

    await botaoDoDialogo(page, 'Confirmar cancelamento?').click()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento cancelado. O horário ficou livre.')
    expect(sim.chamadas).toEqual([{ p_id: expect.any(String), p_status: 'cancelado' }])
  })

  test('"Voltar" desfaz a pergunta, não chama o servidor e devolve o foco ao botão', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')

    await botaoDoDialogo(page, 'Cancelar').click()
    await botaoDoDialogo(page, 'Voltar').click()
    await expect(botaoDoDialogo(page, 'Cancelar')).toBeFocused()
    await expect(botaoDoDialogo(page, 'Voltar')).toHaveCount(0)
    await expect(dialogo(page).getByRole('status')).toHaveText('')
    expect(sim.chamadas).toHaveLength(0)
  })

  test('não compareceu: pede "Confirmar falta?" e só então grava', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')

    await botaoDoDialogo(page, 'Não compareceu').click()
    await expect(botaoDoDialogo(page, 'Confirmar falta?')).toBeVisible()
    expect(sim.chamadas).toHaveLength(0)
    await botaoDoDialogo(page, 'Confirmar falta?').click()
    await expect(dialogo(page).getByRole('status')).toHaveText('Marcado como não compareceu.')
    expect(sim.chamadas.map((c) => c.p_status)).toEqual(['nao_compareceu'])
    await expect(dialogo(page).getByText('Não compareceu', { exact: true })).toBeVisible()
  })

  test('pedir cancelamento e depois clicar em outra ação zera a pergunta', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botaoDoDialogo(page, 'Cancelar').click()
    await botaoDoDialogo(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    expect(sim.chamadas.map((c) => c.p_status)).toEqual(['confirmado'])
    await expect(botaoDoDialogo(page, 'Cancelar')).toBeVisible() // voltou ao rótulo normal
  })

  test('confirmar e concluir gravam no primeiro clique', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    await botaoDoDialogo(page, 'Concluir').click()
    await expect(dialogo(page).getByRole('status')).toHaveText('Atendimento concluído.')
    expect(sim.chamadas.map((c) => c.p_status)).toEqual(['concluido'])
  })

  test('a ação destrutiva em 2ª etapa tem aparência própria (fundo branco com listras)', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const cancelar = botaoDoDialogo(page, 'Cancelar')
    await expect(cancelar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await cancelar.click()
    await page.mouse.move(2, 2) // tira o mouse de cima: o hover muda a cor
    const segunda = botaoDoDialogo(page, 'Confirmar cancelamento?')
    await expect(segunda).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(segunda.locator('.listras')).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Sucesso
// ---------------------------------------------------------------

test.describe('sucesso', () => {
  test('salvando: botões desabilitados; depois o diálogo e o bloco mostram o novo status', async ({ page }) => {
    const sim = await simular(page)
    sim.atrasar(900)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')

    await botaoDoDialogo(page, 'Confirmar').click()
    await expect(botaoDoDialogo(page, 'Salvando…')).toBeDisabled()
    await expect(botaoDoDialogo(page, 'Cancelar')).toBeDisabled()
    await expect(botaoDoDialogo(page, 'Fechar')).toBeDisabled()
    // Esc não fecha durante o salvamento.
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeVisible()

    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    await expect(dialogo(page).getByText('Confirmado', { exact: true })).toBeVisible()
    await expect(dialogo(page).getByText('Pendente', { exact: true })).toHaveCount(0)
    // Agora o confirmado (já começou) mostra as ações do confirmado.
    expect(await acoes(page)).toEqual(['Concluir', 'Não compareceu', 'Cancelar'])
    // O foco não se perde: vai para o título do diálogo.
    await expect(dialogo(page).getByRole('heading', { level: 2 })).toBeFocused()
    // O bloco atrás já reflete o novo status.
    await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Confirmado$/)

    await page.keyboard.press('Escape')
    await expect(bloco(page, 'Ana Pendente')).toBeFocused()
  })

  test('cancelar: o bloco fica riscado, sem ações, e continua na grade (filtro de cancelados ligado)', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO, true)
    await abrir(page, 'Bruno Confirmado')
    await botaoDoDialogo(page, 'Cancelar').click()
    await botaoDoDialogo(page, 'Confirmar cancelamento?').click()
    await expect(dialogo(page).getByRole('status')).toContainText('cancelado')
    expect(await acoes(page)).toEqual([])
    await expect(bloco(page, 'Bruno Confirmado')).toHaveAttribute('aria-label', /Cancelado$/)
    await page.keyboard.press('Escape')
    await expect(bloco(page, 'Bruno Confirmado').getByText('Bruno Confirmado')).toHaveCSS('text-decoration-line', 'line-through')
  })

  test('cancelar com o filtro desligado (padrão): o diálogo segue aberto e o bloco sai da grade', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    await botaoDoDialogo(page, 'Cancelar').click()
    await botaoDoDialogo(page, 'Confirmar cancelamento?').click()
    await expect(dialogo(page).getByRole('status')).toContainText('cancelado')
    // O diálogo continua com o agendamento (mostra o resultado); a grade já o esconde, como faz com todo cancelado.
    await expect(dialogo(page).getByRole('heading', { level: 2, name: 'Bruno Confirmado' })).toBeVisible()
    await expect(bloco(page, 'Bruno Confirmado')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mostrar cancelados (2)' })).toBeVisible()
  })

  test('o novo status sobrevive à atualização silenciosa da agenda', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botaoDoDialogo(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    // Força a rebusca (a aba "volta a ficar visível").
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(500)
    await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Confirmado$/)
    await expect(dialogo(page).getByText('Confirmado', { exact: true })).toBeVisible()
  })

  test('sem rolagem horizontal com o aviso na tela', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botaoDoDialogo(page, 'Cancelar').click()
    await semRolagemHorizontal(page)
    await botaoDoDialogo(page, 'Confirmar cancelamento?').click()
    await expect(dialogo(page).getByRole('status')).toContainText('cancelado')
    await semRolagemHorizontal(page)
  })
})

// ---------------------------------------------------------------
// Erro
// ---------------------------------------------------------------

test.describe('erro', () => {
  const casos: { nome: string; falha: Falha; mensagem: RegExp }[] = [
    {
      nome: 'transição inválida',
      falha: { tipo: 'http', status: 400, code: '23514', message: 'Transição de status inválida: cancelado -> confirmado' },
      mensagem: /já mudou de status/,
    },
    {
      nome: 'atendimento que ainda não começou (URB17)',
      falha: { tipo: 'http', status: 400, code: 'URB17', message: 'O atendimento ainda não começou.' },
      mensagem: /ainda não começou/,
    },
    { nome: 'sem permissão', falha: { tipo: 'http', status: 403, code: '42501', message: 'Acesso negado.' }, mensagem: /não tem permissão/ },
    { nome: 'falha de rede', falha: { tipo: 'rede' }, mensagem: /Sem conexão/ },
    { nome: 'erro do servidor', falha: { tipo: 'http', status: 500, code: 'XX000', message: 'boom' }, mensagem: /Não deu para salvar/ },
  ]

  for (const caso of casos) {
    test(`${caso.nome}: mensagem em português, painel aberto, botões de volta e foco no botão`, async ({ page }) => {
      const sim = await simular(page)
      sim.falhar(caso.falha)
      await irPara(page, PASSADO)
      await abrir(page, 'Ana Pendente')

      await botaoDoDialogo(page, 'Confirmar').click()
      await expect(dialogo(page).getByRole('alert')).toHaveText(caso.mensagem)
      await expect(dialogo(page)).toBeVisible()
      await expect(botaoDoDialogo(page, 'Confirmar')).toBeEnabled()
      await expect(botaoDoDialogo(page, 'Confirmar')).toBeFocused()
      await expect(dialogo(page).getByText('Pendente', { exact: true })).toBeVisible()
      await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Pendente$/)
      await semRolagemHorizontal(page)

      // Tentar de novo depois de a falha passar: funciona e o erro some.
      sim.falhar(null)
      await botaoDoDialogo(page, 'Confirmar').click()
      await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
      await expect(dialogo(page).getByRole('alert')).toHaveCount(0)
    })
  }

  test('cancelar com erro: a pergunta some e o botão volta ao rótulo normal', async ({ page }) => {
    const sim = await simular(page)
    sim.falhar({ tipo: 'rede' })
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botaoDoDialogo(page, 'Cancelar').click()
    await botaoDoDialogo(page, 'Confirmar cancelamento?').click()
    await expect(dialogo(page).getByRole('alert')).toContainText('Sem conexão')
    await expect(botaoDoDialogo(page, 'Cancelar')).toBeVisible()
    await expect(botaoDoDialogo(page, 'Cancelar')).toBeFocused()
  })

  test('transição inválida (alguém mexeu antes) rebusca a agenda; erro de rede não', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')

    sim.falhar({ tipo: 'rede' })
    const antesDaRede = sim.buscas()
    await botaoDoDialogo(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toContainText('Sem conexão')
    expect(sim.buscas()).toBe(antesDaRede)

    sim.falhar({ tipo: 'http', status: 400, code: '23514', message: 'Transição de status inválida: cancelado -> confirmado' })
    await botaoDoDialogo(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toContainText('já mudou de status')
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antesDaRede)
    await expect(dialogo(page)).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Agendamento aberto que some da agenda
// ---------------------------------------------------------------

test.describe('o agendamento aberto some numa atualização da agenda', () => {
  test('o diálogo fecha sozinho, a página volta a rolar e o estado não fica sujo', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

    // Outra pessoa apagou/moveu a Ana: a próxima busca devolve a agenda sem ela (rota mais nova vale primeiro).
    const semAna = async (rota: import('@playwright/test').Route) => {
      const { p_de } = rota.request().postDataJSON() as { p_de: string }
      const resto = linhasDoDia(p_de).filter((l) => l.cliente_nome !== 'Ana Pendente')
      await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resto) })
    }
    await page.route('**/rest/v1/rpc/listar_agenda*', semAna)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect(dialogo(page)).toHaveCount(0)
    await expect(bloco(page, 'Ana Pendente')).toHaveCount(0)
    await expect(bloco(page, 'Bruno Confirmado')).toBeVisible()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')

    // A página atrás voltou a responder: dá para abrir outro agendamento normalmente.
    await abrir(page, 'Bruno Confirmado')
    await page.keyboard.press('Escape')
    await expect(bloco(page, 'Bruno Confirmado')).toBeFocused()

    // Se a Ana voltar à agenda, o diálogo NÃO reabre sozinho (o estado "aberto" foi limpo).
    await page.unroute('**/rest/v1/rpc/listar_agenda*', semAna)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(bloco(page, 'Ana Pendente')).toBeVisible({ timeout: 20_000 }) // 1ª carga sob 3 workers pode passar de 5 s
    await expect(dialogo(page)).toHaveCount(0)
  })

  test('se o bloco que abriu sumiu junto, o teclado segue funcionando e a página destrava', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    await page.route('**/rest/v1/rpc/listar_agenda*', (rota) => {
      const { p_de } = rota.request().postDataJSON() as { p_de: string }
      const resto = linhasDoDia(p_de).filter((l) => l.cliente_nome !== 'Bruno Confirmado')
      return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resto) })
    })
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(dialogo(page)).toHaveCount(0)
    // O bloco que abriu não existe mais: o foco não fica preso em nada; Tab entra na página.
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement !== null)).toBe(true)
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  })
})

// ---------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------

test.describe('Chamar no WhatsApp', () => {
  test('link wa.me com o telefone canônico e a mensagem codificada; abre em outra aba com noopener', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
      .format(new Date(`${PASSADO}T12:00:00Z`))
      .replace(/-feira$/, '')
    const [, mm, dd] = PASSADO.split('-')
    const texto = `Olá, Ana! Aqui é da Menezes Barber’s, sobre seu horário de ${diaSemana} ${dd}/${mm} às 09:00.`

    const link = dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ })
    await expect(link).toHaveAttribute('href', `https://wa.me/5511999990000?text=${encodeURIComponent(texto)}`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('rel', /noreferrer/)
  })

  test('nome com "&" não quebra a URL', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'João & Maria')
    const href = (await dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ }).getAttribute('href'))!
    const url = new URL(href)
    expect(url.pathname).toBe('/5511977776666')
    expect(url.searchParams.getAll('text')).toHaveLength(1)
    expect(url.searchParams.get('text')).toMatch(/^Olá, João! Aqui é da Menezes Barber’s/)
    expect(href).not.toContain(' ')
  })

  test('o link tem o mesmo tamanho de toque dos outros botões', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const caixa = (await dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ }).boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
  })
})

// ---------------------------------------------------------------
// Contraste e foco (computados no navegador)
// ---------------------------------------------------------------

test('contraste AA do texto do diálogo e foco visível nos botões', async ({ page }) => {
  await simular(page)
  await irPara(page, PASSADO)
  await abrir(page, 'Bruno Confirmado')
  await botaoDoDialogo(page, 'Cancelar').click() // 2ª etapa: também precisa passar
  await page.waitForTimeout(400) // as cores do botão têm transição de 200 ms
  const ruins = await dialogo(page).evaluate((raiz) => {
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const nums = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
    const fundoDe = (e: Element | null): number[] => {
      for (let n = e; n; n = n.parentElement) {
        const v = nums(getComputedStyle(n).backgroundColor)
        if (v.length === 3 || (v.length === 4 && v[3] > 0)) return v.slice(0, 3)
      }
      return [0, 0, 0]
    }
    const out: string[] = []
    const folhas = [...raiz.querySelectorAll('h2, dt, dd, p, button, a')].filter((e) =>
      [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
    )
    for (const e of folhas) {
      const l1 = lum(nums(getComputedStyle(e).color).slice(0, 3))
      const l2 = lum(fundoDe(e))
      const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      if (razao < 4.5) out.push(`${e.textContent?.trim().slice(0, 25)} ${razao.toFixed(2)}`)
    }
    return out
  })
  expect(ruins).toEqual([])

  await page.keyboard.press('Tab')
  const contorno = await page.evaluate(() => {
    const e = document.activeElement
    return e ? getComputedStyle(e).outlineStyle : 'none'
  })
  expect(contorno).not.toBe('none')
})

// ---------------------------------------------------------------
// Troca de dia com o diálogo fechado
// ---------------------------------------------------------------

test('navegar para outro dia e voltar não reabre o diálogo', async ({ page }) => {
  await simular(page)
  await irPara(page, PASSADO)
  await abrir(page, 'Ana Pendente')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Próximo dia' }).click()
  await page.getByRole('button', { name: 'Dia anterior' }).click()
  await expect(bloco(page, 'Ana Pendente')).toBeVisible({ timeout: 20_000 }) // 1ª carga sob 3 workers pode passar de 5 s
  await expect(dialogo(page)).toHaveCount(0)
})
