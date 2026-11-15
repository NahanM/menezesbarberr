import { expect, test, type Locator, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// Agenda do dia no /painel (incremento 4.2).
// Login REAL com a conta da equipe (E2E_EMAIL/E2E_SENHA), uma vez por execução. Os dados da agenda
// são SIMULADOS com page.route nas funções listar_agenda / listar_bloqueios e na leitura de barbeiros,
// então o teste é determinístico e não cria nada no banco remoto.

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
// Dados simulados
// ---------------------------------------------------------------

// Quarta-feira. Funcionamento 09:00 às 20:00, então a grade vai de 9h a 19h (11 linhas).
const DIA = '2026-11-04'
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
  { id: B3, nome: 'Caio' },
]
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }

/** Instante em São Paulo (UTC-3) no dia indicado. */
const sp = (hhmm: string, dia = DIA) => `${dia}T${hhmm}:00-03:00`

let contador = 0
function ag(
  barbeiro: string,
  de: string,
  ate: string,
  status: string,
  cliente: string,
  servico = 'Corte',
  dia = DIA,
) {
  contador++
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `T${String(contador).padStart(5, '0')}`,
    status,
    inicio: sp(de, dia),
    fim: sp(ate, dia),
    barbeiro_id: barbeiro,
    barbeiro_nome: NOME[barbeiro],
    servico_nome: servico,
    servico_tipo: 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}

function bloqueio(barbeiro: string | null, de: string, ate: string, motivo: string) {
  contador++
  return {
    id: `20000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    barbeiro_id: barbeiro,
    barbeiro_nome: barbeiro === null ? null : NOME[barbeiro],
    inicio: sp(de),
    fim: sp(ate),
    motivo,
  }
}

const AGENDA_COMPLETA = [
  ag(B1, '09:00', '09:40', 'pendente', 'Ana Pendente'),
  ag(B1, '10:00', '11:00', 'confirmado', 'Bruno Confirmado', 'Combo Essencial'),
  ag(B1, '10:00', '10:40', 'cancelado', 'Carla Cancelada'),
  ag(B2, '14:00', '14:30', 'concluido', 'Davi Concluido'),
  ag(B2, '15:00', '15:15', 'nao_compareceu', 'Edu Faltou'),
]
const BLOQUEIOS_COMPLETOS = [
  bloqueio(null, '12:00', '13:00', 'Almoço da equipe'),
  bloqueio(B3, '16:00', '18:00', 'Folga do Caio'),
]

interface Opcoes {
  barbeiros?: typeof BARBEIROS
  /** Agendamentos de cada dia pedido. */
  agenda?: (dia: string) => unknown[]
  bloqueios?: (dia: string) => unknown[]
  /** Atraso (ms) antes de responder a agenda daquele dia. */
  atraso?: (dia: string) => number
  /** true = responde 500 à agenda daquele dia. */
  falhar?: (dia: string) => boolean
}

/** Simula as três chamadas da tela. Devolve a lista de dias pedidos a `listar_agenda`, em ordem. */
async function simular(page: Page, opcoes: Opcoes = {}) {
  const { barbeiros = BARBEIROS, agenda = () => [], bloqueios = () => [], atraso = () => 0, falhar = () => false } = opcoes
  const pedidos: string[] = []
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })

  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (rota) => rota.fulfill(json(barbeiros)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (rota) => {
    const { p_de } = rota.request().postDataJSON() as { p_de: string }
    return rota.fulfill(json(bloqueios(p_de)))
  })
  await page.route('**/rest/v1/rpc/listar_agenda*', async (rota) => {
    const { p_de } = rota.request().postDataJSON() as { p_de: string }
    pedidos.push(p_de)
    const espera = atraso(p_de)
    if (espera > 0) await new Promise((r) => setTimeout(r, espera))
    if (falhar(p_de)) {
      return rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
    }
    return rota.fulfill(json(agenda(p_de)))
  })
  return pedidos
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
// No celular a coluna é o painel (tabpanel) da aba do barbeiro; no desktop é uma região com nome.
const secao = (page: Page, nome: string) =>
  ehCelular()
    ? page.getByRole('tabpanel', { name: new RegExp(`^${nome},`) })
    : page.getByRole('region', { name: `Agenda de ${nome}` })
/** Todas as colunas montadas (visíveis ou não). */
const todasAsColunas = (page: Page) => page.locator('section[id^="coluna-"]')
const bloco = (onde: Page | Locator, nome: RegExp | string) => onde.getByRole('button', { name: nome })
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

// ---------------------------------------------------------------
// Estados
// ---------------------------------------------------------------

test.describe('estados da tela', () => {
  test('carregando: mostra o aviso, a navegação já está ativa e depois entram as colunas', async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA, atraso: () => 1200 })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('status')).toHaveText('Carregando a agenda')
    await expect(page.getByRole('button', { name: 'Próximo dia' })).toBeEnabled()
    await semRolagemHorizontal(page)
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
  })

  test('vazio: avisa que não há agendamentos e mantém uma coluna por barbeiro', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    // Sem agendamento nenhum, os três barbeiros continuam com coluna (no celular, uma aba para cada um).
    if (ehCelular()) {
      await expect(page.getByRole('tab')).toHaveCount(3)
      await expect(secao(page, 'Rafael')).toBeVisible()
    } else {
      for (const nome of ['Rafael', 'Diego', 'Caio']) await expect(secao(page, nome)).toBeVisible()
    }
    await semRolagemHorizontal(page)
  })

  test('vazio em dia fechado explica que a barbearia não abre', async ({ page }) => {
    await simular(page)
    await page.goto('/painel?dia=2026-11-02') // segunda-feira
    await expect(page.getByText(/A barbearia não abre neste dia/)).toBeVisible()
  })

  test('sem barbeiro ativo: mensagem própria, sem grade', async ({ page }) => {
    await simular(page, { barbeiros: [] })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText(/Nenhum barbeiro ativo/)).toBeVisible()
    await expect(todasAsColunas(page)).toHaveCount(0)
  })

  test('erro: mostra o alerta e "Tentar de novo" busca outra vez', async ({ page }) => {
    let quebrar = true
    const pedidos = await simular(page, { agenda: () => AGENDA_COMPLETA, falhar: () => quebrar })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('alert')).toContainText('Não deu para carregar a agenda.')
    await expect(todasAsColunas(page)).toHaveCount(0)
    await semRolagemHorizontal(page)

    quebrar = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    expect(pedidos).toEqual([DIA, DIA])
  })
})

// ---------------------------------------------------------------
// Colunas e blocos
// ---------------------------------------------------------------

test.describe('colunas por barbeiro', () => {
  test.beforeEach(async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA, bloqueios: () => BLOQUEIOS_COMPLETOS })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
  })

  test('cada agendamento cai na coluna do seu barbeiro, com hora, cliente, serviço e status', async ({ page }) => {
    const rafael = secao(page, 'Rafael')
    await expect(bloco(rafael, /09:00 – 09:40, Ana Pendente, Corte, Pendente/)).toBeVisible()
    await expect(bloco(rafael, /10:00 – 11:00, Bruno Confirmado, Combo Essencial, Confirmado/)).toBeVisible()
    await expect(rafael.getByText('Confirmado', { exact: true })).toBeVisible()
    await expect(rafael.getByText('Pendente', { exact: true })).toBeVisible()
    await expect(rafael.getByText('Davi Concluido')).toHaveCount(0)

    if (!ehCelular()) {
      const diego = secao(page, 'Diego')
      await expect(bloco(diego, /Davi Concluido.*Concluído/)).toBeVisible()
      await expect(bloco(diego, /Edu Faltou.*Não compareceu/)).toBeVisible()
      await expect(diego.getByText('Ana Pendente')).toHaveCount(0)
    }
  })

  test('barbeiro sem agendamento no dia tem coluna', async ({ page }) => {
    if (ehCelular()) await page.getByRole('tab', { name: /Caio/ }).click()
    const caio = secao(page, 'Caio')
    await expect(caio).toBeVisible()
    await expect(caio.locator('button:not([aria-label^="Bloqueio"])')).toHaveCount(0)
  })

  test('a posição segue a hora: uma hora a mais fica 6rem (96px) mais abaixo', async ({ page }) => {
    const rafael = secao(page, 'Rafael')
    const nove = await bloco(rafael, /Ana Pendente/).boundingBox()
    const dez = await bloco(rafael, /Bruno Confirmado/).boundingBox()
    expect(nove && dez).toBeTruthy()
    expect(Math.abs(dez!.y - nove!.y - 96)).toBeLessThanOrEqual(2)
  })

  test('cancelado e confirmado sobrepostos dividem a coluna; cancelado fica riscado (com o filtro ligado)', async ({ page }) => {
    // Desde o F9 o cancelado sai da grade por padrão; este teste ligou o filtro pela URL para vê-lo.
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, /Carla Cancelada/)).toBeVisible()
    const rafael = secao(page, 'Rafael')
    const confirmado = await bloco(rafael, /Bruno Confirmado/).boundingBox()
    const cancelado = await bloco(rafael, /Carla Cancelada/).boundingBox()
    expect(confirmado && cancelado).toBeTruthy()
    expect(Math.abs(confirmado!.y - cancelado!.y)).toBeLessThanOrEqual(2)
    expect(confirmado!.x).not.toBeCloseTo(cancelado!.x, 0)
    // Metade da coluna cada um (a coluna tem borda de 1px).
    const largura = (await rafael.boundingBox())!.width
    expect(confirmado!.width).toBeLessThan(largura * 0.6)
    expect(cancelado!.width).toBeLessThan(largura * 0.6)

    const nome = bloco(rafael, /Carla Cancelada/).getByText('Carla Cancelada')
    await expect(nome).toHaveCSS('text-decoration-line', 'line-through')
    await expect(bloco(rafael, /Ana Pendente/).getByText('Ana Pendente')).toHaveCSS('text-decoration-line', 'none')
  })

  test('bloqueios aparecem hachurados com o motivo; o da barbearia vale para todas as colunas', async ({ page }) => {
    const geral = page.getByRole('button', { name: /Bloqueio, 12:00 – 13:00, toda a barbearia: Almoço da equipe/ })
    await expect(geral).toHaveCount(ehCelular() ? 1 : 3)
    await expect(geral.first()).toContainText('Almoço da equipe')
    // Hachura "////": camada com o gradiente repetido das listras da identidade.
    const listras = geral.first().locator('.listras')
    await expect(listras).toHaveCSS('background-image', /repeating-linear-gradient/)

    if (ehCelular()) await page.getByRole('tab', { name: /Caio/ }).click()
    await expect(
      secao(page, 'Caio').getByRole('button', { name: /Bloqueio, 16:00 – 18:00, Caio: Folga do Caio/ }),
    ).toBeVisible()
    // Folga do Caio não aparece na coluna do Rafael.
    if (!ehCelular()) {
      await expect(secao(page, 'Rafael').getByText('Folga do Caio')).toHaveCount(0)
    }
  })

  test('bloco recebe foco pelo teclado', async ({ page }) => {
    const ana = bloco(page, /Ana Pendente/)
    await ana.focus()
    await expect(ana).toBeFocused()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON')
    await expect(ana).not.toBeFocused()
  })

  test('sem rolagem horizontal da página', async ({ page }) => {
    await semRolagemHorizontal(page)
  })
})

// ---------------------------------------------------------------
// Filtro dos cancelados (F9)
// ---------------------------------------------------------------

test.describe('cancelados fora da grade por padrão', () => {
  const botao = (page: Page) => page.getByRole('button', { name: /(Mostrar|Ocultar) cancelados/ })

  test.beforeEach(async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA, bloqueios: () => BLOQUEIOS_COMPLETOS })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
  })

  test('por padrão o cancelado não aparece e o botão mostra a quantidade', async ({ page }) => {
    await expect(bloco(page, /Carla Cancelada/)).toHaveCount(0)
    await expect(botao(page)).toHaveText('Mostrar cancelados (1)')
    // Sem o cancelado, o ativo ocupa a coluna inteira (antes dividia com ele).
    const largura = (await secao(page, 'Rafael').boundingBox())!.width
    const bruno = await bloco(secao(page, 'Rafael'), /Bruno Confirmado/).boundingBox()
    expect(bruno!.width).toBeGreaterThan(largura * 0.9)
    // "Não compareceu" nunca some (só existe na coluna do Diego: no celular, só depois da aba).
    if (ehCelular()) await page.getByRole('tab', { name: /Diego/ }).click()
    await expect(bloco(page, /Edu Faltou.*Não compareceu/)).toBeVisible()
  })

  test('ligar o botão põe ?cancelados=1 na URL e traz o cancelado de volta, riscado e atrás do ativo', async ({ page }) => {
    await botao(page).click()
    await expect(botao(page)).toHaveText(/^Ocultar cancelados/)
    await expect(page).toHaveURL(/cancelados=1/)
    const carla = bloco(secao(page, 'Rafael'), /Carla Cancelada/)
    await expect(carla).toBeVisible()
    await expect(carla.getByText('Carla Cancelada')).toHaveCSS('text-decoration-line', 'line-through')
    // O wrapper do cancelado esmaece (opacity baixa) e fica numa camada abaixo do ativo.
    const camadas = await page.evaluate(() => {
      const de = (texto: string) =>
        [...document.querySelectorAll<HTMLElement>('section[id^="coluna-"] button')]
          .find((b) => b.getAttribute('aria-label')?.includes(texto))!.parentElement!
      const estilo = (el: HTMLElement) => getComputedStyle(el)
      return {
        cancelado: { z: estilo(de('Carla Cancelada')).zIndex, opacidade: estilo(de('Carla Cancelada')).opacity },
        ativo: { z: estilo(de('Bruno Confirmado')).zIndex, opacidade: estilo(de('Bruno Confirmado')).opacity },
      }
    })
    expect(Number(camadas.cancelado.opacidade)).toBeLessThan(1)
    expect(camadas.ativo.opacidade).toBe('1')
    expect(Number(camadas.ativo.z)).toBeGreaterThan(Number(camadas.cancelado.z))
    // Desligar tira o parâmetro e esconde de novo.
    await botao(page).click()
    await expect(page).not.toHaveURL(/cancelados/)
    await expect(bloco(page, /Carla Cancelada/)).toHaveCount(0)
  })

  test('o estado sobrevive a recarregar a página', async ({ page }) => {
    await botao(page).click()
    await page.reload()
    await expect(botao(page)).toHaveText(/^Ocultar cancelados/)
    await expect(bloco(page, /Carla Cancelada/)).toBeVisible()
  })

  test('abrir o cancelado mostra os detalhes; o botão tem foco visível pelo teclado', async ({ page }) => {
    await botao(page).focus()
    await expect(botao(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(botao(page)).toHaveText(/^Ocultar cancelados/)
    await bloco(page, /Carla Cancelada/).click()
    await expect(page.getByRole('dialog')).toContainText('Carla Cancelada')
    await expect(page.getByRole('dialog').getByText('Cancelado', { exact: true })).toBeVisible()
  })

  test('os números do resumo não mudam com o filtro e a página não rola para os lados', async ({ page }) => {
    const resumo = page.getByRole('region', { name: 'Resumo do dia' })
    const antes = await resumo.innerText()
    await botao(page).click()
    expect(await resumo.innerText()).toBe(antes)
    await semRolagemHorizontal(page)
  })

  test('sem cancelados no dia o botão não aparece', async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA.filter((a) => a.status !== 'cancelado') })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    await expect(botao(page)).toHaveCount(0)
  })

  test('o filtro ligado acompanha a troca de dia', async ({ page }) => {
    await botao(page).click()
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page).toHaveURL(/dia=2026-11-05&cancelados=1/)
  })
})

test.describe('celular: abas por barbeiro', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ehCelular(), 'abas só existem no celular')
    await simular(page, { agenda: () => AGENDA_COMPLETA, bloqueios: () => BLOQUEIOS_COMPLETOS })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
  })

  test('uma coluna por vez, na largura inteira, trocando pela aba', async ({ page }) => {
    const abas = page.getByRole('tablist', { name: 'Barbeiros' })
    await expect(abas.getByRole('tab')).toHaveCount(3)
    await expect(abas.getByRole('tab', { name: /Rafael/ })).toHaveAttribute('aria-selected', 'true')
    await expect(secao(page, 'Diego')).toBeHidden()
    // Rafael tem 2 ativos (o cancelado não conta).
    await expect(abas.getByRole('tab', { name: 'Rafael, 2 agendamentos' })).toBeVisible()

    await abas.getByRole('tab', { name: /Diego/ }).click()
    await expect(abas.getByRole('tab', { name: /Diego/ })).toHaveAttribute('aria-selected', 'true')
    await expect(secao(page, 'Diego')).toBeVisible()
    await expect(secao(page, 'Rafael')).toBeHidden()
    await expect(bloco(page, /Davi Concluido/)).toBeVisible()
    await semRolagemHorizontal(page)

    // A coluna visível ocupa quase a largura toda (descontado o eixo de horas).
    const largura = (await secao(page, 'Diego').boundingBox())!.width
    expect(largura).toBeGreaterThanOrEqual(270)
  })

  test('setas do teclado movem entre as abas', async ({ page }) => {
    const abas = page.getByRole('tablist', { name: 'Barbeiros' })
    await abas.getByRole('tab', { name: /Rafael/ }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(abas.getByRole('tab', { name: /Diego/ })).toBeFocused()
    await expect(secao(page, 'Diego')).toBeVisible()
    await page.keyboard.press('End')
    await expect(abas.getByRole('tab', { name: /Caio/ })).toBeFocused()
    await page.keyboard.press('ArrowRight') // do último volta ao primeiro
    await expect(abas.getByRole('tab', { name: /Rafael/ })).toBeFocused()
  })

  test('a escolha de barbeiro continua ao trocar de dia', async ({ page }) => {
    // Os horários dos dados simulados são de DIA; o dia seguinte precisa ter os seus (rotas novas valem daqui em diante).
    await simular(page, {
      agenda: (dia) => (dia === DIA ? AGENDA_COMPLETA : [ag(B2, '14:00', '14:30', 'concluido', 'Davi Concluido', 'Corte', dia)]),
    })
    await page.getByRole('tab', { name: /Diego/ }).click()
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    // Espera a grade do novo dia voltar (a de Diego, não a de Rafael) antes de conferir a aba.
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
    await expect(bloco(page, /Davi Concluido/)).toBeVisible()
    await expect(page.getByRole('tab', { name: /Diego/ })).toHaveAttribute('aria-selected', 'true')
  })
})

test('no desktop não há abas, todas as colunas ficam lado a lado e na ordem dos barbeiros', async ({ page }) => {
  test.skip(ehCelular(), 'desktop')
  await simular(page, { agenda: () => AGENDA_COMPLETA })
  await page.goto(`/painel?dia=${DIA}`)
  await expect(page.getByRole('tablist')).toBeHidden()
  const xs = []
  for (const nome of ['Rafael', 'Diego', 'Caio']) xs.push((await secao(page, nome).boundingBox())!.x)
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
  await semRolagemHorizontal(page)
})

test.describe('acessibilidade das colunas e das abas', () => {
  test('celular: cada coluna é o tabpanel da sua aba; desktop: região sem papel de painel', async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    const colunas = todasAsColunas(page)
    await expect(colunas).toHaveCount(3)
    for (const [i, id] of [B1, B2, B3].entries()) {
      const coluna = colunas.nth(i)
      if (ehCelular()) {
        await expect(coluna).toHaveAttribute('role', 'tabpanel')
        await expect(coluna).toHaveAttribute('aria-labelledby', `aba-${id}`)
        await expect(coluna).not.toHaveAttribute('aria-label', /.+/)
        await expect(page.locator(`#aba-${id}`)).toHaveAttribute('aria-controls', `coluna-${id}`)
      } else {
        await expect(coluna).not.toHaveAttribute('role', /.+/)
        await expect(coluna).not.toHaveAttribute('aria-labelledby', /.+/)
        await expect(coluna).toHaveAttribute('aria-label', `Agenda de ${NOME[id]}`)
      }
    }
  })

  test('celular: quatro barbeiros cabem nas abas em 360px, sem rolar', async ({ page }) => {
    test.skip(!ehCelular(), 'abas só existem no celular')
    const B4 = '00000000-0000-4000-8000-0000000000b4'
    await simular(page, { barbeiros: [...BARBEIROS, { id: B4, nome: 'Marcelo' }] })
    await page.goto(`/painel?dia=${DIA}`)
    const abas = page.getByRole('tab')
    await expect(abas).toHaveCount(4)
    const lista = page.getByRole('tablist', { name: 'Barbeiros' })
    const { rolagem, visivel } = await lista.evaluate((el) => ({ rolagem: el.scrollWidth, visivel: el.clientWidth }))
    expect(rolagem).toBeLessThanOrEqual(visivel)
    for (let i = 0; i < 4; i++) {
      const caixa = (await abas.nth(i).boundingBox())!
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(360)
    }
  })
})

test.describe('atualização silenciosa', () => {
  const NOVO = 'Cliente Novo'

  /** Marca em window.__piscou se algum aviso de "carregando" (role=status) entrar na tela depois de agora. */
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

  test('ao voltar para a aba, a agenda se atualiza sem passar por "carregando"', async ({ page }) => {
    let versao = 0
    const pedidos = await simular(page, {
      agenda: () => (versao === 0 ? [AGENDA_COMPLETA[0]] : [AGENDA_COMPLETA[0], ag(B1, '16:00', '16:40', 'pendente', NOVO)]),
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    await vigiarPiscada(page)

    versao = 1
    await voltarParaAAba(page)
    await expect(bloco(page, new RegExp(NOVO))).toBeVisible()
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    expect(pedidos).toHaveLength(2)
    expect(await piscou(page)).toBe(false)
  })

  test('se a atualização silenciosa falhar, os dados ficam e não aparece erro', async ({ page }) => {
    let quebrar = false
    const pedidos = await simular(page, { agenda: () => [AGENDA_COMPLETA[0]], falhar: () => quebrar })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    await vigiarPiscada(page)

    quebrar = true
    await voltarParaAAba(page)
    await expect.poll(() => pedidos.length).toBe(2)
    await page.waitForTimeout(300)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await piscou(page)).toBe(false)
  })

  test('a cada 60 s a agenda se atualiza sozinha', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install()
    let versao = 0
    const pedidos = await simular(page, {
      agenda: () => (versao === 0 ? [AGENDA_COMPLETA[0]] : [AGENDA_COMPLETA[0], ag(B1, '16:00', '16:40', 'pendente', NOVO)]),
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ana Pendente/)).toBeVisible()
    expect(pedidos).toHaveLength(1)
    await vigiarPiscada(page)

    versao = 1
    await page.clock.fastForward(60_000)
    await expect(bloco(page, new RegExp(NOVO))).toBeVisible()
    expect(pedidos).toHaveLength(2)
    expect(await piscou(page)).toBe(false)
  })
})

// ---------------------------------------------------------------
// Fuso
// ---------------------------------------------------------------

test.describe('fuso do navegador diferente de São Paulo', () => {
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('hora e dia continuam em America/Sao_Paulo', async ({ page }) => {
    // 09:00 em SP é 21:00 em Tóquio do mesmo dia; 23:30 em SP já é o dia seguinte em Tóquio.
    await simular(page, {
      agenda: () => [ag(B1, '09:00', '09:40', 'pendente', 'Ana Pendente'), ag(B1, '23:00', '23:30', 'confirmado', 'Noite Tarde')],
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    await expect(bloco(page, /09:00 – 09:40, Ana Pendente/)).toBeVisible()
    await expect(bloco(page, /23:00 – 23:30, Noite Tarde/)).toBeVisible()
    // O atendimento das 23h amplia a grade até a meia-noite: aparece a linha das 23:00.
    await expect(page.getByText('23:00', { exact: true })).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Navegação por dia e URL
// ---------------------------------------------------------------

test.describe('navegação por dia', () => {
  test('anterior, próximo e hoje atualizam a data, a URL e a busca', async ({ page }) => {
    const pedidos = await simular(page, {
      agenda: (dia) => (dia === DIA ? AGENDA_COMPLETA : [ag(B1, '09:00', '09:40', 'confirmado', `Cliente ${dia}`, 'Corte', dia)]),
    })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')

    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
    await expect(page).toHaveURL(/[?&]dia=2026-11-05$/)
    await expect(bloco(page, /Cliente 2026-11-05/)).toBeVisible()
    await expect(bloco(page, /Ana Pendente/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Dia anterior' }).click()
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
    await page.getByRole('button', { name: 'Dia anterior' }).click()
    await expect(page.getByText('terça, 03/11')).toBeVisible()
    await expect(page).toHaveURL(/[?&]dia=2026-11-03$/)

    await page.getByRole('button', { name: 'Hoje', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]dia=${hojeEmSP()}$`))
    await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-current', 'date')
    await expect.poll(() => pedidos).toEqual([DIA, '2026-11-05', DIA, '2026-11-03', hojeEmSP()])
    await semRolagemHorizontal(page)
  })

  test('o botão voltar do navegador volta ao dia anterior', async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA })
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
    await page.goBack()
    await expect(page.getByText('quarta, 04/11')).toBeVisible()
  })

  test('recarregar mantém o dia da URL', async ({ page }) => {
    await simular(page, { agenda: () => AGENDA_COMPLETA })
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
    await page.reload()
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
  })

  test('sem ?dia, abre em hoje (pedindo a agenda de hoje)', async ({ page }) => {
    const pedidos = await simular(page)
    await page.goto('/painel')
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    expect(pedidos).toEqual([hojeEmSP()])
    await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-current', 'date')
  })

  for (const ruim of ['lixo', '2026-02-30', '2026-13-01', '04/11/2026', '']) {
    test(`?dia inválido (${JSON.stringify(ruim)}) cai em hoje`, async ({ page }) => {
      const pedidos = await simular(page)
      await page.goto(`/painel?dia=${encodeURIComponent(ruim)}`)
      await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
      expect(pedidos).toEqual([hojeEmSP()])
    })
  }

  test('resposta atrasada de um dia não sobrescreve o dia escolhido depois', async ({ page }) => {
    await simular(page, {
      agenda: (dia) => [ag(B1, '09:00', '09:40', 'pendente', dia === DIA ? 'Cliente Lento' : 'Cliente Rapido', 'Corte', dia)],
      atraso: (dia) => (dia === DIA ? 1500 : 0),
    })
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(bloco(page, /Cliente Rapido/)).toBeVisible()
    // Espera a resposta lenta do dia anterior chegar e confere que ela foi descartada.
    await page.waitForTimeout(2000)
    await expect(bloco(page, /Cliente Rapido/)).toBeVisible()
    await expect(bloco(page, /Cliente Lento/)).toHaveCount(0)
    await expect(page.getByText('quinta, 05/11')).toBeVisible()
  })
})

// ---------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('/painel?dia=... sem login mostra o formulário e não pede a agenda', async ({ page }) => {
    const pedidos = await simular(page, { agenda: () => AGENDA_COMPLETA })
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(todasAsColunas(page)).toHaveCount(0)
    expect(pedidos).toEqual([])
  })
})
