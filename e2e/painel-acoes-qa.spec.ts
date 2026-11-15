import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// QA do incremento 4.4: bordas dos detalhes e ações do agendamento no /painel.
// Login real (E2E_EMAIL/E2E_SENHA); agenda e mudar_status SIMULADOS com page.route: nada é gravado no remoto.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-acoes-qa')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const hojeEmSP = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const PASSADO = somarDias(hojeEmSP(), -3)
const FUTURO = somarDias(hojeEmSP(), 3)
const sp = (hhmm: string, dia: string) => `${dia}T${hhmm}:00-03:00`

const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'

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
interface Cliente {
  nome: string
  status: string
  de: string
  ate: string
  tel?: string
  dia?: string
  /** início/fim absolutos (ISO), para os testes de relógio */
  inicioISO?: string
  fimISO?: string
}

const PADRAO: Cliente[] = [
  { nome: 'Ana Pendente', status: 'pendente', de: '09:00', ate: '09:40' },
  { nome: 'Bruno Confirmado', status: 'confirmado', de: '10:00', ate: '11:00' },
]

const PERMITIDAS: Record<string, string[]> = {
  pendente: ['confirmado', 'cancelado'],
  confirmado: ['concluido', 'cancelado', 'nao_compareceu'],
}

type Falha = { tipo: 'http'; status: number; code: string; message: string } | { tipo: 'rede' } | { tipo: 'vazio' }

interface Sim {
  chamadas: { p_id: string; p_status: string }[]
  buscas: () => number
  estado: Map<string, Linha>
  falhar: (f: Falha | null) => void
  /**
   * Segura a resposta de mudar_status até `liberar()`. Para os testes que olham o estado "Salvando…": um atraso
   * em milissegundos some sob carga (a resposta chega antes de o teste olhar); o portão espera o teste.
   * Se o teste terminar sem liberar, a rota pendurada é liberada quando o contexto da página fecha.
   */
  segurar: () => () => void
  /** Quando true, listar_agenda devolve a foto "congelada" do momento (simula resposta velha). */
  congelarBusca: (c: boolean) => void
}

async function simular(page: Page, clientes: Cliente[] = PADRAO, dias: string[] = [PASSADO, FUTURO]): Promise<Sim> {
  const estado = new Map<string, Linha>()
  const adicionar = (c: Cliente, dia: string, i: number) => {
    const id = `10000000-0000-4000-8000-${dia.replaceAll('-', '')}${String(i + 1).padStart(4, '0')}`
    estado.set(id, {
      id,
      codigo: `Q${String(i + 1).padStart(3, '0')}XZ`,
      status: c.status,
      inicio: c.inicioISO ?? sp(c.de, dia),
      fim: c.fimISO ?? sp(c.ate, dia),
      barbeiro_id: B1,
      barbeiro_nome: 'Rafael',
      servico_nome: 'Corte',
      servico_tipo: 'avulso',
      cliente_nome: c.nome,
      cliente_telefone: c.tel ?? '5511999990000',
    })
  }
  for (const dia of dias) clientes.forEach((c, i) => adicionar(c, c.dia ?? dia, i))

  const chamadas: Sim['chamadas'] = []
  let falha: Falha | null = null
  let portao: Promise<void> | null = null
  let buscas = 0
  let congelada: Linha[] | null = null
  const json = (corpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo) })

  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json([{ id: B1, nome: 'Rafael' }, { id: B2, nome: 'Diego' }])))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => rota.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', (rota) => {
    const { p_de } = rota.request().postDataJSON() as { p_de: string }
    buscas++
    const todas = congelada ?? [...estado.values()].map((l) => ({ ...l }))
    return rota.fulfill(json(todas.filter((l) => l.inicio.startsWith(p_de) || hojeDe(l.inicio) === p_de)))
  })
  await page.route('**/rest/v1/rpc/mudar_status*', async (rota) => {
    const corpo = rota.request().postDataJSON() as { p_id: string; p_status: string }
    chamadas.push(corpo)
    if (portao) await portao
    if (falha?.tipo === 'rede') return rota.abort('failed')
    if (falha?.tipo === 'vazio') return rota.fulfill(json([]))
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
    estado,
    falhar: (f) => {
      falha = f
    },
    segurar: () => {
      let liberar!: () => void
      portao = new Promise<void>((resolver) => (liberar = resolver))
      return liberar
    },
    congelarBusca: (c) => {
      congelada = c ? [...estado.values()].map((l) => ({ ...l })) : null
    },
  }
}
const hojeDe = (iso: string) => hojeEmSP(new Date(iso))

const bloco = (page: Page, nome: string) => page.locator(`section[id^="coluna-"] button[aria-label*="${nome}"]`)
const dialogo = (page: Page) => page.getByRole('dialog')
// O botão "Cancelar" tem nome acessível "Cancelar agendamento" (o texto na tela continua "Cancelar").
const botao = (page: Page, nome: string) =>
  dialogo(page).getByRole('button', { name: nome === 'Cancelar' ? 'Cancelar agendamento' : nome, exact: true })

async function irPara(page: Page, dia: string, primeiro = 'Ana Pendente') {
  await page.goto(`/painel?dia=${dia}`)
  await expect(bloco(page, primeiro)).toBeVisible({ timeout: 20_000 }) // 1ª carga sob 3 workers pode passar de 5 s
}
async function abrir(page: Page, nome: string) {
  await bloco(page, nome).click()
  await expect(dialogo(page)).toBeVisible()
}
const semRolagemHorizontal = async (page: Page) => {
  const r = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(r.l).toBeLessThanOrEqual(r.v)
}
const celular = () => test.info().project.name === 'celular'

// ---------------------------------------------------------------
// Cliques repetidos
// ---------------------------------------------------------------

test.describe('cliques repetidos', () => {
  test('duplo clique em Confirmar: 1 só chamada', async ({ page }) => {
    const sim = await simular(page)
    const liberar = sim.segurar() // os dois cliques caem com o salvamento em andamento, por mais lenta que esteja a máquina
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').dblclick()
    liberar()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    expect(sim.chamadas).toHaveLength(1)
  })

  test('Enter duas vezes seguidas em Confirmar: 1 só chamada', async ({ page }) => {
    const sim = await simular(page)
    const liberar = sim.segurar()
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    liberar()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    expect(sim.chamadas).toHaveLength(1)
  })

  test('duplo toque em Cancelar NÃO pode cancelar (as 2 etapas existem para evitar toque acidental)', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Cancelar').dblclick()
    // O 2º toque cai no mesmo lugar, agora "Confirmar cancelamento?": não deveria executar sem um gesto deliberado.
    await page.waitForTimeout(500)
    expect(sim.chamadas, 'dois toques rápidos executaram o cancelamento').toHaveLength(0)
  })

  test('duplo toque em Não compareceu NÃO pode gravar a falta', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    await botao(page, 'Não compareceu').dblclick()
    await page.waitForTimeout(500)
    expect(sim.chamadas, 'dois toques rápidos gravaram a falta').toHaveLength(0)
  })
})

// ---------------------------------------------------------------
// Fechar durante o salvamento
// ---------------------------------------------------------------

test.describe('fechar durante o salvamento', () => {
  test('Fechar desabilitado, clique no fundo e Esc não fecham; o resultado aparece', async ({ page }) => {
    const sim = await simular(page)
    const liberar = sim.segurar()
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(botao(page, 'Salvando…')).toBeVisible()
    await expect(botao(page, 'Fechar')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeVisible()
    if (celular()) await page.mouse.click(180, 5)
    else await page.mouse.click(10, 400)
    await expect(dialogo(page)).toBeVisible()
    liberar()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
  })

  test('Esc duas vezes durante o salvamento (Chromium deixa o 2º fechar): o dialog fecha sem quebrar a página', async ({ page }) => {
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    const sim = await simular(page)
    const liberar = sim.segurar()
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(botao(page, 'Salvando…')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    liberar()
    // Aceitável: fechou ou não. Inaceitável: página travada, erro de JS, scroll preso ou resultado perdido.
    await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Confirmado$/, { timeout: 8000 })
    await expect(dialogo(page)).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    expect(erros).toEqual([])
    await bloco(page, 'Bruno Confirmado').click() // a página responde de novo
    await expect(dialogo(page)).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Trocar de dia e atualizações com o dialog aberto
// ---------------------------------------------------------------

test.describe('com o dialog aberto', () => {
  test('voltar no histórico para outro dia fecha o dialog e solta a rolagem', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page).toHaveURL(new RegExp(`dia=${somarDias(PASSADO, 1)}`))
    // O próximo dia está vazio no simulador: abrir por outro caminho (voltar e abrir lá).
    await page.goBack()
    await expect(bloco(page, 'Ana Pendente')).toBeVisible()
    await abrir(page, 'Ana Pendente')
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`dia=${somarDias(PASSADO, 1)}`))
    await expect(dialogo(page)).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    // Volta ao dia original: o dialog não reabre sozinho.
    await page.goBack()
    await expect(bloco(page, 'Ana Pendente')).toBeVisible()
    await expect(dialogo(page)).toHaveCount(0)
    await abrir(page, 'Ana Pendente') // e abre normalmente
  })

  test('atualização de 60 s com o dialog aberto: status novo (feito por outra pessoa) aparece e as ações se ajustam', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date() })
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await expect(dialogo(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible()
    // Outra pessoa cancela no servidor.
    for (const l of sim.estado.values()) if (l.cliente_nome === 'Ana Pendente') l.status = 'cancelado'
    const antes = sim.buscas()
    await page.clock.runFor(61_000)
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antes)
    await expect(dialogo(page)).toBeVisible()
    await expect(dialogo(page).getByText('Cancelado', { exact: true })).toBeVisible()
    await expect(botao(page, 'Confirmar')).toHaveCount(0)
    await expect(botao(page, 'Cancelar')).toHaveCount(0)
  })

  test('atualização de 60 s com a pergunta de cancelar aberta: se o status mudou, a pergunta não fica órfã', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date() })
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Cancelar').click()
    await expect(botao(page, 'Confirmar cancelamento?')).toBeVisible()
    for (const l of sim.estado.values()) if (l.cliente_nome === 'Ana Pendente') l.status = 'cancelado'
    await page.clock.runFor(61_000)
    await expect(dialogo(page).getByText('Cancelado', { exact: true })).toBeVisible()
    // Nenhuma ação resta; a frase de pergunta antiga ("Toque de novo para confirmar") não pode ficar na tela.
    await expect(dialogo(page).getByRole('status')).not.toContainText('Toque de novo')
  })

  test('agendamento some do servidor durante a atualização: dialog fecha, rolagem solta, página responde', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date() })
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    for (const [id, l] of sim.estado) if (l.cliente_nome === 'Ana Pendente') sim.estado.delete(id)
    await page.clock.runFor(61_000)
    await expect(dialogo(page)).toHaveCount(0)
    await expect(bloco(page, 'Ana Pendente')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await bloco(page, 'Bruno Confirmado').click()
    await expect(dialogo(page)).toBeVisible()
  })

  test('busca velha chegando durante o salvamento não desfaz o resultado', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date() })
    const sim = await simular(page)
    const liberar = sim.segurar()
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(botao(page, 'Salvando…')).toBeVisible()
    const antes = sim.buscas()
    await page.clock.runFor(61_000) // dispara a atualização silenciosa, que ainda vê "pendente"
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antes) // a busca velha chegou ao servidor com o salvamento ainda em andamento
    liberar()
    await expect(dialogo(page).getByRole('status')).toHaveText('Agendamento confirmado.')
    await page.waitForTimeout(800)
    await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Confirmado$/)
    await expect(dialogo(page).getByText('Confirmado', { exact: true })).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Relógio: o início do atendimento
// ---------------------------------------------------------------

test.describe('relógio simulado', () => {
  test('confirmado de hoje: Concluir e Não compareceu surgem sozinhos com o dialog aberto quando o início passa', async ({ page }) => {
    const agora = Date.now()
    // Início daqui a 10 min (na hora cheia do minuto seguinte ao arredondamento). Perto da meia-noite o dia muda: pula.
    const inicio = new Date(Math.ceil((agora + 10 * 60_000) / 60_000) * 60_000)
    test.skip(hojeEmSP(inicio) !== hojeEmSP(new Date(agora)) || hojeEmSP(new Date(agora - 3600_000)) !== hojeEmSP(), 'perto da meia-noite')
    const fim = new Date(inicio.getTime() + 30 * 60_000)
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date(agora) })
    await simular(
      page,
      [{ nome: 'Rui Hoje', status: 'confirmado', de: '', ate: '', inicioISO: inicio.toISOString(), fimISO: fim.toISOString() }],
      [hojeEmSP()],
    )
    await irPara(page, hojeEmSP(), 'Rui Hoje')
    await abrir(page, 'Rui Hoje')
    await expect(botao(page, 'Cancelar')).toBeVisible()
    await expect(botao(page, 'Concluir')).toHaveCount(0)
    // Avança até 1 min antes do início: ainda não.
    await page.clock.runFor(inicio.getTime() - Date.now() - 60_000)
    await page.clock.runFor(1000)
    await expect(botao(page, 'Concluir')).toHaveCount(0)
    // Passa do início (2 ticks de 30 s garantem pelo menos um depois do instante).
    await page.clock.runFor(100_000)
    await expect(botao(page, 'Concluir')).toBeVisible()
    await expect(botao(page, 'Não compareceu')).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Erros
// ---------------------------------------------------------------

test.describe('erros', () => {
  test('servidor responde 200 com lista vazia: mensagem genérica, dialog aberto, estado intacto', async ({ page }) => {
    const sim = await simular(page)
    sim.falhar({ tipo: 'vazio' })
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toHaveText(/Não deu para salvar/)
    await expect(dialogo(page)).toBeVisible()
    await expect(bloco(page, 'Ana Pendente')).toHaveAttribute('aria-label', /Pendente$/)
  })

  test('sessão vencida (JWT expired): mensagem de sessão, dialog aberto', async ({ page }) => {
    const sim = await simular(page)
    sim.falhar({ tipo: 'http', status: 401, code: 'PGRST303', message: 'JWT expired' })
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toHaveText(/sessão expirou/)
    await expect(dialogo(page)).toBeVisible()
  })

  test('agendamento removido por outra pessoa (URB11): mensagem e a agenda rebuscada', async ({ page }) => {
    const sim = await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    sim.falhar({ tipo: 'http', status: 400, code: 'URB11', message: 'Agendamento não encontrado.' })
    const antes = sim.buscas()
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toContainText(/Não achamos/)
    await expect.poll(() => sim.buscas()).toBeGreaterThan(antes)
  })

  test('erro aparece, depois o próximo sucesso limpa o alerta e o foco vai ao título', async ({ page }) => {
    const sim = await simular(page)
    sim.falhar({ tipo: 'rede' })
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toBeVisible()
    sim.falhar(null)
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toHaveCount(0)
    await expect(dialogo(page).getByRole('heading', { level: 2 })).toBeFocused()
  })
})

// ---------------------------------------------------------------
// WhatsApp do cliente
// ---------------------------------------------------------------

test.describe('link do WhatsApp do cliente', () => {
  const clientes: Cliente[] = [
    { nome: 'Fixo Dez', status: 'pendente', de: '09:00', ate: '09:40', tel: '1133334444' },
    { nome: 'Cel Onze', status: 'pendente', de: '10:00', ate: '10:40', tel: '11999990000' },
    { nome: 'Fixo Doze', status: 'pendente', de: '11:00', ate: '11:40', tel: '551133334444' },
    { nome: 'Cel Treze', status: 'pendente', de: '12:00', ate: '12:40', tel: '5511999990000' },
    { nome: 'Zé 😀 A&B Ção', status: 'pendente', de: '13:00', ate: '13:40', tel: '5511999990000' },
  ]
  const casos: [string, string][] = [
    ['Fixo Dez', '551133334444'],
    ['Cel Onze', '5511999990000'],
    ['Fixo Doze', '551133334444'],
    ['Cel Treze', '5511999990000'],
  ]
  for (const [nome, numero] of casos) {
    test(`${nome}: wa.me/${numero}`, async ({ page }) => {
      await simular(page, clientes)
      await irPara(page, PASSADO, 'Fixo Dez')
      await abrir(page, nome)
      const href = await dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ }).getAttribute('href')
      expect(new URL(href!).pathname).toBe(`/${numero}`)
    })
  }

  test('nome com emoji, acento e &: texto codificado, 1 só parâmetro, rel e target corretos', async ({ page }) => {
    await simular(page, clientes)
    await irPara(page, PASSADO, 'Fixo Dez')
    await abrir(page, 'Zé 😀')
    const link = dialogo(page).getByRole('link', { name: /Chamar no WhatsApp/ })
    const href = (await link.getAttribute('href'))!
    const url = new URL(href)
    expect(url.origin).toBe('https://wa.me')
    expect([...url.searchParams.keys()]).toEqual(['text'])
    expect(url.searchParams.get('text')).toMatch(/^Olá, Zé! Aqui é da Menezes Barber’s, sobre seu horário de /)
    expect(href).not.toMatch(/[ ]|&(?!$)/)
    expect(await link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(await link.getAttribute('target')).toBe('_blank')
  })
})

// ---------------------------------------------------------------
// Acessibilidade
// ---------------------------------------------------------------

test.describe('acessibilidade', () => {
  test('o dialog é nomeado pelo nome do cliente; a região de status existe e está vazia antes da ação', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await expect(page.getByRole('dialog', { name: 'Ana Pendente' })).toBeVisible()
    const status = dialogo(page).getByRole('status')
    await expect(status).toHaveCount(1)
    await expect(status).toHaveText('')
    // O dialog nativo modal expõe aria-modal implícito: o fundo fica inerte.
    const inerte = await page.evaluate(() => {
      const h1 = document.querySelector('h1') as HTMLElement
      const antes = document.activeElement
      h1.tabIndex = -1
      h1.focus()
      return { focou: document.activeElement === h1, antes: antes?.tagName }
    })
    expect(inerte.focou, 'a página atrás do dialog recebeu foco').toBe(false)
  })

  test('o botão destrutivo tem nome acessível que diz o que cancela (não só "Cancelar", ambíguo com fechar o dialog)', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const nomes = await dialogo(page).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()))
    const cancelar = nomes.find((n) => /cancelar/i.test(n ?? ''))
    expect(cancelar, `botões: ${nomes.join(' | ')}`).toMatch(/agendamento/i)
  })

  test('os links e botões do dialog têm foco visível', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    for (const alvo of [botao(page, 'Confirmar'), botao(page, 'Fechar'), dialogo(page).getByRole('link', { name: /WhatsApp/ })]) {
      await alvo.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      const contorno = await alvo.evaluate((e) => {
        const s = getComputedStyle(e)
        return { estilo: s.outlineStyle, largura: parseFloat(s.outlineWidth), sombra: s.boxShadow }
      })
      expect(contorno.estilo !== 'none' && contorno.largura > 0 || contorno.sombra !== 'none').toBe(true)
    }
  })
})

// ---------------------------------------------------------------
// Contraste AA
// ---------------------------------------------------------------

test.describe('contraste AA', () => {
  function luminancia([r, g, b]: number[]) {
    const f = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const razao = (a: number[], b: number[]) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)

  /** Cor do texto e do fundo efetivo (sobe até achar fundo opaco). */
  async function cores(alvo: ReturnType<typeof botao>) {
    return alvo.evaluate((el) => {
      let fundo = 'rgba(0, 0, 0, 0)'
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor
        if (c !== 'rgba(0, 0, 0, 0)' && !c.endsWith(', 0)')) {
          fundo = c
          break
        }
      }
      return { texto: getComputedStyle(el).color, fundo }
    })
  }

  test('texto dos botões: normal, hover, 2ª etapa listrada, e rótulos do dialog >= 4.5:1', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Bruno Confirmado')
    const lista: [string, ReturnType<typeof botao>][] = [
      ['Concluir', botao(page, 'Concluir')],
      ['Não compareceu', botao(page, 'Não compareceu')],
      ['Cancelar', botao(page, 'Cancelar')],
      ['Fechar', botao(page, 'Fechar')],
      ['WhatsApp', dialogo(page).getByRole('link', { name: /WhatsApp/ })],
    ]
    for (const [nome, alvo] of lista) {
      await page.mouse.move(2, 2)
      const n = await cores(alvo)
      expect(razao(rgb(n.texto), rgb(n.fundo)), `${nome} normal ${n.texto} / ${n.fundo}`).toBeGreaterThanOrEqual(4.5)
      await alvo.hover()
      await page.waitForTimeout(250)
      const h = await cores(alvo)
      expect(razao(rgb(h.texto), rgb(h.fundo)), `${nome} hover ${h.texto} / ${h.fundo}`).toBeGreaterThanOrEqual(4.5)
    }
    // 2ª etapa
    await page.mouse.move(2, 2)
    await botao(page, 'Cancelar').click()
    const seg = botao(page, 'Confirmar cancelamento?')
    await page.mouse.move(2, 2)
    await page.waitForTimeout(250)
    const s = await cores(seg)
    expect(razao(rgb(s.texto), rgb(s.fundo)), `2ª etapa ${s.texto} / ${s.fundo}`).toBeGreaterThanOrEqual(4.5)
    await seg.hover()
    await page.waitForTimeout(250)
    const sh = await cores(seg)
    expect(razao(rgb(sh.texto), rgb(sh.fundo)), `2ª etapa hover ${sh.texto} / ${sh.fundo}`).toBeGreaterThanOrEqual(4.5)
    // Rótulos (dt) e textos do corpo
    const corpo = await dialogo(page).locator('dt, dd, p').evaluateAll((els) =>
      els
        .filter((e) => (e.textContent ?? '').trim() !== '')
        .map((e) => {
          let fundo = 'rgba(0, 0, 0, 0)'
          for (let n: Element | null = e; n; n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor
            if (c !== 'rgba(0, 0, 0, 0)') {
              fundo = c
              break
            }
          }
          return { t: (e.textContent ?? '').slice(0, 20), cor: getComputedStyle(e).color, fundo }
        }),
    )
    for (const c of corpo) expect(razao(rgb(c.cor), rgb(c.fundo)), `${c.t}: ${c.cor} / ${c.fundo}`).toBeGreaterThanOrEqual(4.5)
  })

  test('borda do botão em contorno (cancelar) tem >= 3:1 contra o fundo do dialog', async ({ page }) => {
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const c = await botao(page, 'Cancelar').evaluate((el) => {
      let fundo = ''
      for (let n: Element | null = el; n; n = n.parentElement) {
        const f = getComputedStyle(n).backgroundColor
        if (f !== 'rgba(0, 0, 0, 0)') {
          fundo = f
          break
        }
      }
      return { borda: getComputedStyle(el).borderTopColor, fundo }
    })
    expect(razao(rgb(c.borda), rgb(c.fundo))).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------
// Layout, rolagem, movimento
// ---------------------------------------------------------------

test.describe('layout', () => {
  test('tela baixa: o conteúdo do dialog rola e o último botão fica alcançável; sem rolagem horizontal', async ({ page }) => {
    await simular(page, [
      { nome: 'Nome Muito Longo '.repeat(3).trim(), status: 'confirmado', de: '10:00', ate: '11:00', tel: '5511999990000' },
    ])
    await page.setViewportSize({ width: celular() ? 360 : 1440, height: 420 })
    await irPara(page, PASSADO, 'Nome Muito Longo')
    await abrir(page, 'Nome Muito Longo')
    const info = await dialogo(page).evaluate((d) => ({
      rola: d.scrollHeight > d.clientHeight,
      overflowY: getComputedStyle(d).overflowY,
      altura: d.getBoundingClientRect().height,
      janela: window.innerHeight,
    }))
    expect(info.overflowY).toMatch(/auto|scroll/)
    expect(info.altura).toBeLessThanOrEqual(info.janela)
    if (info.rola) {
      const ultimo = dialogo(page).getByRole('link', { name: /WhatsApp/ })
      await ultimo.scrollIntoViewIfNeeded()
      const caixa = (await ultimo.boundingBox())!
      expect(caixa.y + caixa.height).toBeLessThanOrEqual(info.janela + 1)
      expect(caixa.y).toBeGreaterThanOrEqual(0)
    }
    await semRolagemHorizontal(page)
    const fora = await dialogo(page).evaluate((d) => d.scrollWidth > d.clientWidth)
    expect(fora, 'rolagem horizontal dentro do dialog').toBe(false)
  })

  test('360px: dialog colado à base, largura total, com o alerta de erro visível', async ({ page }) => {
    test.skip(!celular(), 'só no celular')
    const sim = await simular(page)
    sim.falhar({ tipo: 'http', status: 400, code: '23514', message: 'Transição de status inválida: x -> y' })
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    await botao(page, 'Confirmar').click()
    await expect(dialogo(page).getByRole('alert')).toBeVisible()
    const caixa = (await dialogo(page).boundingBox())!
    const viewport = page.viewportSize()!
    expect(Math.round(caixa.x)).toBe(0)
    expect(Math.round(caixa.width)).toBe(viewport.width)
    expect(Math.round(caixa.y + caixa.height)).toBe(viewport.height)
    await semRolagemHorizontal(page)
  })

  test('movimento reduzido: sem animação no dialog e no fundo; com movimento, só transform/opacity', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await simular(page)
    await irPara(page, PASSADO)
    await abrir(page, 'Ana Pendente')
    const reduzido = await dialogo(page).evaluate((d) => ({
      anim: getComputedStyle(d).animationName,
      fundo: getComputedStyle(d, '::backdrop').animationName,
    }))
    expect(reduzido.anim).toBe('none')
    expect(reduzido.fundo).toBe('none')
    await page.keyboard.press('Escape')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrir(page, 'Ana Pendente')
    const normal = await dialogo(page).evaluate((d) => getComputedStyle(d).animationName)
    expect(normal).toMatch(/folha-(sobe|entra)/)
    const props = await page.evaluate(() => {
      const nomes = ['folha-sobe', 'folha-entra', 'fundo-aparece']
      const achadas: string[] = []
      for (const folha of document.styleSheets) {
        for (const regra of folha.cssRules) {
          if (regra instanceof CSSKeyframesRule && nomes.includes(regra.name)) {
            for (const k of regra.cssRules) achadas.push(...Array.from((k as CSSKeyframeRule).style))
          }
        }
      }
      return [...new Set(achadas)]
    })
    for (const p of props) expect(['transform', 'opacity']).toContain(p)
  })
})
