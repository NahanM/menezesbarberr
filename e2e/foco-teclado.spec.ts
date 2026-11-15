import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// Incremento 5.5: foco visível, ordem do Tab e link "Pular para o conteúdo" nas 3 rotas.
// A cada Tab o foco precisa: (1) ter contorno visível (2px ou mais), (2) estar dentro da tela e
// (3) não ficar coberto por outra coisa (ex.: o cabeçalho fixo). Rádio e checkbox escondidos
// (sr-only) mostram o contorno no <label>, então o teste olha o label nesses casos.

interface Parada {
  tag: string
  nome: string
  anel: boolean
  naTela: boolean
  coberto: boolean
}

/** Lê o elemento que tem o foco agora. null = o foco está no <body> (saiu da página). */
function lerFoco(page: Page): Promise<Parada | null> {
  return page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null
    if (!e || e === document.body) return null
    const input = e as HTMLInputElement
    // Controle escondido (1px): o contorno aparece no <label> dele.
    const alvo = e.offsetWidth <= 1 && input.labels?.[0] ? input.labels[0] : e
    const cs = getComputedStyle(alvo)
    const anel = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none'
    const r = alvo.getBoundingClientRect()
    const naTela = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
    // O ponto central precisa mostrar o próprio elemento (ou algo dentro ou fora dele na mesma cadeia).
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1)
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1)
    const topo = document.elementFromPoint(x, y)
    const coberto = !topo || !(alvo.contains(topo) || topo.contains(alvo))
    return {
      tag: e.tagName,
      nome: (e.getAttribute('aria-label') || e.textContent || input.name || '').trim().slice(0, 40),
      anel,
      naTela,
      coberto,
    }
  })
}

/**
 * Aperta Tab `vezes` vezes e confere cada parada. O scroll que traz o foco para a tela pode ser animado
 * (Lenis, rolagem dos combos), então espera até ficar tudo certo, em vez de olhar de imediato.
 * Devolve os nomes das paradas, na ordem. Para quando o foco sai da página (fim do ciclo).
 */
async function percorrer(page: Page, vezes: number): Promise<string[]> {
  const nomes: string[] = []
  for (let i = 0; i < vezes; i++) {
    await page.keyboard.press('Tab')
    let ultima: Parada | null = null
    try {
      await expect
        .poll(
          async () => {
            ultima = await lerFoco(page)
            return ultima === null || (ultima.anel && ultima.naTela && !ultima.coberto)
          },
          { timeout: 4000 },
        )
        .toBe(true)
    } catch {
      throw new Error(`Parada ${i + 1} do Tab com problema: ${JSON.stringify(ultima)}`)
    }
    if (ultima === null) break
    nomes.push((ultima as Parada).nome)
  }
  return nomes
}

/** Primeiro Tab → link de pular; Enter → foco no <main>; próximo Tab → dentro do <main>. */
async function conferirPular(page: Page) {
  await page.keyboard.press('Tab')
  const link = page.getByRole('link', { name: 'Pular para o conteúdo' })
  await expect(link).toBeFocused()
  // Visível de verdade quando focado (1px escondido não vale).
  const caixa = await link.boundingBox()
  expect(caixa && caixa.width > 100 && caixa.height > 30 && caixa.y >= 0).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await page.keyboard.press('Tab')
  const dentro = await page.evaluate(() => document.querySelector('main')!.contains(document.activeElement))
  expect(dentro).toBe(true)
}

/**
 * Pular a partir do meio da página: o topo do <main> não pode ficar atrás do cabeçalho fixo (4rem),
 * e o primeiro título dentro dele precisa aparecer abaixo desse cabeçalho.
 */
async function conferirPosicaoDoPular(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(500)
  const rolou = await page.evaluate(() => window.scrollY)
  expect(rolou, 'a página precisa ter rolado para o teste valer').toBeGreaterThan(30)
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  await expect
    .poll(() => page.evaluate(() => Math.round(document.querySelector('main')!.getBoundingClientRect().top)), { timeout: 4000 })
    .toBeGreaterThanOrEqual(0)
  const medidas = await page.evaluate(() => {
    const topoMain = document.querySelector('main')!.getBoundingClientRect().top
    const cabecalho = [...document.querySelectorAll('header')].find((h) => getComputedStyle(h).position === 'fixed')
    const titulo = document.querySelector('main h1, main h2')
    return {
      topoMain,
      alturaCabecalho: cabecalho ? cabecalho.getBoundingClientRect().bottom : 0,
      topoTitulo: titulo ? titulo.getBoundingClientRect().top : null,
    }
  })
  // O topo do main está na tela (rolou até ele), mas no máximo 4rem abaixo do alto (a margem de rolagem).
  expect(medidas.topoMain).toBeLessThanOrEqual(65)
  // Se há cabeçalho fixo, o primeiro título não fica sob ele.
  if (medidas.topoTitulo !== null) expect(medidas.topoTitulo).toBeGreaterThanOrEqual(medidas.alturaCabecalho)
}

// ---------------------------------------------------------------
// Landing
// ---------------------------------------------------------------

test.describe('landing', () => {
  test('pular para o conteúdo funciona', async ({ page }) => {
    await page.goto('/')
    await conferirPular(page)
  })

  test('pular a partir do meio da página: o topo do conteúdo não fica sob o cabeçalho', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await conferirPosicaoDoPular(page)
  })

  test('ordem do Tab: pular, cabeçalho, hero, combos; todas as paradas com anel, na tela e descobertas', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const nomes = await percorrer(page, 30)
    expect(nomes[0]).toBe('Pular para o conteúdo')
    expect(nomes[1]).toMatch(/Menezes Barber’s/)
    const verCombos = nomes.indexOf('Ver combos')
    const i1 = nomes.findIndex((n) => /^Agendar Essencial/.test(n))
    const i2 = nomes.findIndex((n) => /^Agendar Cuidado Completo/.test(n))
    const i3 = nomes.findIndex((n) => /^Agendar Experiência Premium/.test(n))
    expect(verCombos).toBeGreaterThan(1)
    expect(i1).toBeGreaterThan(verCombos)
    expect(i2).toBeGreaterThan(i1)
    expect(i3).toBeGreaterThan(i2)
  })
})

// ---------------------------------------------------------------
// /agendar
// ---------------------------------------------------------------

test.describe('/agendar', () => {
  const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']
  test.beforeEach(async ({ page }) => {
    await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
      }),
    )
  })

  test('pular a partir do meio da página: o topo do conteúdo não fica sob o cabeçalho', async ({ page }) => {
    await page.goto('/agendar')
    await expect(page.locator('main')).toBeVisible()
    await conferirPosicaoDoPular(page)
  })

  test('pular para o conteúdo funciona', async ({ page }) => {
    await page.goto('/agendar')
    // A página chega por React.lazy: espera ela montar (o link de pular já existe antes, mas ainda não há <main>).
    await expect(page.locator('main')).toBeVisible()
    await conferirPular(page)
  })

  for (const [rotulo, url] of [
    ['passo 1', '/agendar'],
    ['passo 2', '/agendar?combo=essencial'],
    ['passo 3', '/agendar?combo=essencial&passo=3'],
  ] as const) {
    test(`${rotulo}: paradas com anel, na tela e descobertas`, async ({ page }) => {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(900) // transição entre passos
      const nomes = await percorrer(page, 12)
      expect(nomes[0]).toBe('Pular para o conteúdo')
      expect(nomes[1]).toMatch(/Menezes Barber’s/)
      expect(nomes[2]).toBe('Sair do agendamento')
      expect(nomes.length).toBeGreaterThan(4)
    })
  }

  test('passos 4 e 5: campos e botões em ordem, com anel', async ({ page }) => {
    await page.goto('/agendar?combo=essencial&barbeiro=rafael')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page
      .locator('label')
      .filter({ has: page.getByRole('radio', { name: '09:00' }) })
      .click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await page.waitForTimeout(900)
    const dados = await percorrer(page, 8)
    expect(dados).toContain('Revisar')
    await page.getByLabel('Nome').fill('João Silva')
    await page.getByLabel('WhatsApp').fill('11999998888')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await page.waitForTimeout(900)
    const revisao = await percorrer(page, 14)
    expect(revisao).toContain('Editar serviço')
    expect(revisao).toContain('Confirmar')
    expect(revisao.indexOf('Editar serviço')).toBeLessThan(revisao.indexOf('Confirmar'))
  })
})

// ---------------------------------------------------------------
// /painel
// ---------------------------------------------------------------

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-foco')

test.describe('painel: login', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('pular para o conteúdo funciona', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await conferirPular(page)
  })

  test('ordem: pular, e-mail, senha, entrar', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('E-mail')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Senha')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeFocused()
  })

  test('paradas com anel, na tela e descobertas', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    const nomes = await percorrer(page, 6)
    expect(nomes).toHaveLength(4)
  })
})

test.describe('painel: logado', () => {
  test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
  test.use({ storageState: ESTADO })

  test.beforeAll(async ({ browser }, info) => {
    if (!temConta) return
    await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
  })

  const DIA = '2026-11-04'
  const B1 = '00000000-0000-4000-8000-0000000000b1'
  const B2 = '00000000-0000-4000-8000-0000000000b2'
  const agenda = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      codigo: 'T00001',
      status: 'pendente',
      inicio: `${DIA}T09:00:00-03:00`,
      fim: `${DIA}T09:40:00-03:00`,
      barbeiro_id: B1,
      barbeiro_nome: 'Rafael',
      servico_nome: 'Corte',
      servico_tipo: 'avulso',
      cliente_nome: 'Ana Pendente',
      cliente_telefone: '11999990000',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      codigo: 'T00002',
      status: 'confirmado',
      inicio: `${DIA}T10:00:00-03:00`,
      fim: `${DIA}T11:00:00-03:00`,
      barbeiro_id: B2,
      barbeiro_nome: 'Diego',
      servico_nome: 'Combo Essencial',
      servico_tipo: 'combo',
      cliente_nome: 'Bruno Confirmado',
      cliente_telefone: '11999990001',
    },
  ]
  test.beforeEach(async ({ page }) => {
    const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
    await simularEquipe(page)
    await page.route('**/rest/v1/barbeiros*', (r) =>
      r.fulfill(
        json([
          { id: B1, nome: 'Rafael' },
          { id: B2, nome: 'Diego' },
        ]),
      ),
    )
    await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json([])))
    await page.route('**/rest/v1/rpc/listar_agenda*', (r) => r.fulfill(json(agenda)))
  })

  test('Dia: pular para o conteúdo funciona', async ({ page }) => {
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible({ timeout: 20_000 }) // login real: o Supabase às vezes passa de 5 s
    await conferirPular(page)
  })

  test('Dia: pular a partir do meio da página volta ao topo do conteúdo', async ({ page }) => {
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('section[id^="coluna-"] button[aria-label*="Ana Pendente"]')).toBeVisible()
    await conferirPosicaoDoPular(page)
  })

  test('Dia: paradas com anel, na tela e descobertas', async ({ page }) => {
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('section[id^="coluna-"] button[aria-label*="Ana Pendente"]')).toBeVisible()
    const nomes = await percorrer(page, 25)
    expect(nomes[0]).toBe('Pular para o conteúdo')
    expect(nomes.some((n) => /Ana Pendente/.test(n))).toBe(true)
  })

  test('Semana: paradas com anel, na tela e descobertas', async ({ page }) => {
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(page.getByRole('list', { name: 'Dias da semana' })).toBeVisible()
    const nomes = await percorrer(page, 20)
    expect(nomes[0]).toBe('Pular para o conteúdo')
    expect(nomes.length).toBeGreaterThan(8)
  })
})
