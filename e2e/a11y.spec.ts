import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { chavesDe, medirContrasteEmPixels, reprovadas, type Medida } from './ajudas-contraste.ts'
import { LINHA_COMBOS, LINHA_FRASES, PILHA, SEQUENCIA, aguardarTelaAssentada, irParaFracao } from './ajudas-rolagem.ts'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// Incremento 5.5: varredura de acessibilidade (axe) nas 3 rotas.
// Tags: WCAG 2.0 A/AA, 2.1 AA e 2.2 AA. Qualquer violação (de qualquer impacto) reprova o teste;
// regras desligadas ficam em DESLIGADAS, cada uma com o motivo.
// Dados do /agendar e do /painel são simulados com page.route; o painel usa o login real da equipe
// (E2E_EMAIL/E2E_SENHA), como os outros specs do painel. Nada é gravado no banco.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

/**
 * Regras desligadas, cada uma só no seletor indicado.
 * Hoje a lista está vazia: nenhum falso positivo apareceu. Se aparecer, registre aqui como
 * { regra: 'color-contrast', seletor: '.hero-foto', motivo: '...' }.
 */
const DESLIGADAS: { regra: string; seletor: string; motivo: string }[] = []

/**
 * Contraste que o axe não consegue medir ("incomplete": texto sobre foto, gradiente ou elemento sobreposto)
 * NÃO passa em branco. Cada alvo é medido em pixels (e2e/ajudas-contraste.ts), com 3:1 para texto grande e
 * 4,5:1 para o resto. Reprova também quem não pôde ser medido (não encontrado, sem pixels, instável).
 * Passam sem medida só: (1) palavras vazadas, que são decorativas e têm aria-hidden, e (2) os textos de
 * COBERTOS_POR_OUTRA_CENA, que não estão visíveis na cena em curso.
 */
interface Cobertura {
  /** Cenas (rótulos de varrer) em que o texto foi medido de verdade, por projeto. */
  medidos: Map<string, Set<string>>
  /** Textos aceitos como "coberto por outra cena" nas cenas rodadas, por projeto. */
  aceitos: Map<string, Set<string>>
  cenas: Map<string, Set<string>>
}
const cobertura: Cobertura = { medidos: new Map(), aceitos: new Map(), cenas: new Map() }
const doProjeto = <T,>(mapa: Map<string, Set<T>>, projeto: string) => {
  if (!mapa.has(projeto)) mapa.set(projeto, new Set())
  return mapa.get(projeto)!
}

/**
 * Elementos do "incomplete" que, na cena em curso, estão fora da tela ou cobertos. Cada item aponta a cena
 * que mede o mesmo texto. O teste "cobertura" no fim da landing confere que ele FOI medido (medido, não
 * apenas listado) em alguma cena do mesmo projeto: lista sem medida correspondente reprova.
 * A chave é "dono|texto" (aria-label do post ou id da seção, mais o texto).
 */
const COBERTOS_POR_OUTRA_CENA: { chave: RegExp; cena: string }[] = [
  { chave: /^Combo 0[123]: /, cena: 'combos presos: combo 1, 2 e 3 (cada post é medido quando está por cima)' },
  { chave: /^hero\|/, cena: 'hero com movimento, no topo (e rolado)' },
  { chave: /^manutencao\|/, cena: 'sequência de frases e landing com reduced-motion (meio)' },
  { chave: /^servicos\|/, cena: 'landing com reduced-motion (topo, meio e fim)' },
  { chave: /^cta\|/, cena: 'landing com reduced-motion, no fim' },
  { chave: /^local\|/, cena: 'landing com reduced-motion, no fim' },
]

async function varrer(page: Page, rotulo: string) {
  // O axe mede a cor do momento: espera mola, carimbo e transições assentarem antes de medir.
  await aguardarTelaAssentada(page)
  let axe = new AxeBuilder({ page }).withTags(TAGS)
  for (const d of DESLIGADAS) axe = axe.disableRules(d.regra).exclude(d.seletor)
  const { violations, incomplete, passes } = await axe.analyze()
  const resumo = violations.map((v) => ({
    regra: v.id,
    impacto: v.impact,
    ajuda: v.help,
    alvos: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    total: v.nodes.length,
  }))
  expect(resumo, `violações de acessibilidade em: ${rotulo}`).toEqual([])

  const projeto = test.info().project.name
  doProjeto(cobertura.cenas, projeto).add(rotulo)
  // O que o próprio axe mediu e aprovou nesta cena também conta como "medido" (ex.: texto sobre fundo liso).
  const aprovados = passes.filter((i) => i.id === 'color-contrast').flatMap((i) => i.nodes.map((n) => n.target.join(' ')))
  for (const chave of await chavesDe(page, aprovados)) doProjeto(cobertura.medidos, projeto).add(chave)
  const semMedida = incomplete
    .filter((i) => i.id === 'color-contrast')
    .flatMap((i) => i.nodes.map((n) => n.target.join(' ')))
  if (semMedida.length > 0) {
    const medidas = await medirContrasteEmPixels(page, semMedida)
    for (const m of medidas) if (m.situacao === 'medido') doProjeto(cobertura.medidos, projeto).add(m.chave)
    const coberto = (m: Medida) => {
      const ok = COBERTOS_POR_OUTRA_CENA.some((c) => c.chave.test(m.chave))
      if (ok) doProjeto(cobertura.aceitos, projeto).add(m.chave)
      return ok
    }
    if (process.env.DEBUG_CONTRASTE) {
      for (const m of medidas) if (m.situacao !== 'medido' && m.situacao !== 'decorativo') console.log(projeto, rotulo, m.situacao, m.chave)
    }
    expect(reprovadas(medidas, coberto), `contraste (pixels) abaixo de AA ou sem medida em: ${rotulo}`).toEqual([])
  }
}

// ---------------------------------------------------------------
// Landing
// ---------------------------------------------------------------

test.describe('landing, reduced-motion', () => {
  // Reduced-motion estabiliza a página: sem pin, sem parallax, sem marquee.
  test.use({ reducedMotion: 'reduce' })

  test('no topo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await varrer(page, 'landing, topo')
  })

  test('no meio', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2))
    await page.waitForTimeout(500)
    await varrer(page, 'landing, meio')
  })

  test('na seção Local', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.locator('#local').scrollIntoViewIfNeeded()
    await page.evaluate(() => document.querySelector('#local')!.scrollIntoView({ block: 'end' }))
    await page.waitForTimeout(500)
    await varrer(page, 'landing, local')
  })

  test('no fim', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(500)
    await varrer(page, 'landing, fim')
  })
})

test.describe('landing, com movimento', () => {
  // Sem reducedMotion: hero com parallax, faixa em movimento, sequência e combos presos (pin).
  test('hero no topo, depois da entrada das linhas', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(1800) // linhas do título subindo + revelação diagonal da foto
    await varrer(page, 'landing com movimento, hero')
  })

  test('hero com parallax (rolado um pouco)', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1800)
    await page.evaluate(() => window.scrollTo(0, 250))
    await page.waitForTimeout(900) // mola do parallax assenta
    await varrer(page, 'landing com movimento, hero rolado')
  })

  test('sequência de frases, no meio de uma frase', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const [de, ate] = LINHA_FRASES.frase(1).pausa
    await irParaFracao(page, SEQUENCIA, (de + ate) / 2)
    await varrer(page, 'landing com movimento, sequência de frases')
  })

  test('fechamento da sequência de frases', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const [de, ate] = LINHA_FRASES.fechamento.pausa
    await irParaFracao(page, SEQUENCIA, (de + ate) / 2)
    await varrer(page, 'landing com movimento, fechamento da sequência')
  })

  for (const [rotulo, post] of [
    ['combo 1', 0],
    ['combo 2 cobrindo o 1', 1],
    ['combo 3', 2],
  ] as const) {
    test(`combos presos: ${rotulo}`, async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await irParaFracao(page, PILHA, post === 0 ? 0.02 : LINHA_COMBOS.meioDaPausa(post))
      await page.waitForTimeout(900) // o carimbo de preço bate (350 ms de atraso + animação)
      await varrer(page, `landing com movimento, ${rotulo}`)
    })
  }
})

// Cenas de landing varridas neste arquivo (reduced-motion: 4; com movimento: 7). Usado pelo teste de cobertura.
const CENAS_LANDING = 11

test.describe('landing: cobertura da medida de contraste', () => {
  test('todo texto aceito como "coberto por outra cena" foi medido de verdade em alguma cena', async () => {
    const projeto = test.info().project.name
    const cenas = [...(cobertura.cenas.get(projeto) ?? [])].filter((c) => c.startsWith('landing'))
    test.skip(cenas.length < CENAS_LANDING, 'rode o arquivo inteiro: este teste cruza o resultado das cenas da landing')
    const medidos = cobertura.medidos.get(projeto) ?? new Set<string>()
    const semMedida = [...(cobertura.aceitos.get(projeto) ?? [])].filter((chave) => !medidos.has(chave))
    expect(semMedida, 'textos listados como cobertos por outra cena, mas nunca medidos').toEqual([])
  })
})

// Controles: a medida de pixels precisa REPROVAR casos ruins, senão ela não protege nada.
test.describe('medida de contraste em pixels: controles', () => {
  const pagina = (corpo: string) =>
    `<body style="margin:0;background:#000"><div id="bloco" style="position:fixed;top:40px;left:20px;width:320px;height:140px;background:#f4f4f4"><p id="t" style="margin:0;padding:20px;font:700 40px sans-serif;${corpo}">TEXTO CLARO</p></div></body>`

  test('texto branco sobre bloco quase branco reprova', async ({ page }) => {
    await page.setContent(pagina('color:#fff'))
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeLessThan(1.2)
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  test('texto branco sobre fundo branco (a cor do texto é a do fundo) reprova', async ({ page }) => {
    await page.setContent(pagina('color:#fff').replace('#f4f4f4', '#fff'))
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeLessThan(1.1)
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  test('texto preto sobre bloco quase branco passa', async ({ page }) => {
    await page.setContent(pagina('color:#000'))
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeGreaterThan(15)
    expect(reprovadas(medidas)).toEqual([])
  })

  test('texto que não é pintado (opacity 0) vira "sem-pixels" e reprova', async ({ page }) => {
    await page.setContent(pagina('color:#000;opacity:0'))
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('sem-pixels')
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  // O fundo desenhado com currentColor (Listras, gradientes, setas) tem de contar: a medida não pode apagá-lo
  // e comparar o texto com o preto da página.
  const NEON = 'rgb(212, 253, 1)'
  const sobreNeon = (fundo: string) =>
    `<body style="margin:0;background:#000"><div style="position:fixed;top:40px;left:20px;width:320px;height:140px;color:${NEON}">${fundo}<p id="t" style="position:relative;margin:0;padding:20px;font:700 40px sans-serif;color:#fff">TEXTO CLARO</p></div></body>`

  test('texto branco sobre faixa neon feita com currentColor (gradiente) reprova, medido contra o neon', async ({ page }) => {
    await page.setContent(
      sobreNeon('<div style="position:absolute;inset:0;background-image:linear-gradient(currentColor, currentColor)"></div>'),
    )
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeLessThan(1.3) // contra o preto seria 21:1
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  test('texto branco sobre faixa neon desenhada num SVG com currentColor reprova, medido contra o neon', async ({ page }) => {
    await page.setContent(
      sobreNeon('<svg width="320" height="140" style="position:absolute;inset:0"><rect width="320" height="140" fill="currentColor"/></svg>'),
    )
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeLessThan(1.3)
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  test('<text> de SVG como alvo: fill branco sobre fundo quase branco reprova', async ({ page }) => {
    await page.setContent(
      '<body style="margin:0;background:#000"><svg width="400" height="120" style="position:fixed;top:40px;left:20px"><rect width="400" height="120" fill="#f4f4f4"/><text id="t" x="10" y="80" font-size="56" font-weight="700" fill="#fff">TEXTO</text></svg></body>',
    )
    const medidas = await medirContrasteEmPixels(page, ['#t'])
    expect(medidas[0].situacao).toBe('medido')
    expect(medidas[0].contraste!).toBeLessThan(1.2)
    expect(reprovadas(medidas)).toHaveLength(1)
  })

  test('elemento coberto ou não encontrado reprova, a não ser que esteja na lista explícita', async ({ page }) => {
    await page.setContent(
      pagina('color:#000') +
        '<div style="position:fixed;inset:0;background:#222;z-index:10"></div>',
    )
    const medidas = await medirContrasteEmPixels(page, ['#t', '#nao-existe'])
    expect(medidas.map((m) => m.situacao)).toEqual(['coberto', 'nao-encontrado'])
    expect(reprovadas(medidas)).toHaveLength(2)
    // Lista explícita libera só o coberto; o não encontrado continua reprovando.
    expect(reprovadas(medidas, (m) => m.situacao === 'coberto')).toHaveLength(1)
  })
})

// Contraste do texto do hero sobre a foto, em pixels (o axe não mede texto sobre imagem).
test.describe('hero: contraste do texto sobre a foto (pixels)', () => {
  const ALVOS = [
    // Uma medida por linha do título: cada uma tem o seu tamanho de fonte (texto grande = 3:1).
    { nome: 'título, linha 1', seletor: '#hero h1 > span:nth-child(1)' },
    { nome: 'título, linha 2', seletor: '#hero h1 > span:nth-child(2)' },
    { nome: 'título, linha 3', seletor: '#hero h1 > span:nth-child(3)' },
    { nome: 'link "Ver combos"', seletor: '#hero a[href="/#combos"]' },
    { nome: 'frase "Firmeza em cada detalhe."', seletor: '#hero p', soDesktop: true },
  ]

  for (const alvo of ALVOS) {
    test(alvo.nome, async ({ page }, info) => {
      test.skip(Boolean(alvo.soDesktop) && info.project.name !== 'desktop', 'só existe no desktop')
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(1800) // linhas subindo + revelação diagonal da foto
      const [m] = await medirContrasteEmPixels(page, [alvo.seletor])
      expect(m.situacao, `${alvo.nome} precisa estar visível para ser medido`).toBe('medido')
      expect(reprovadas([m]), alvo.nome).toEqual([])
    })
  }
})

// ---------------------------------------------------------------
// /agendar
// ---------------------------------------------------------------

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']
const RESERVA = [
  {
    codigo: 'K7M2PX',
    barbeiro_nome: 'Rafael',
    servico_nome: 'Essencial',
    preco_total_centavos: 8000,
    duracao_total_min: 60,
    inicio: HORARIOS[0],
  },
]

const horariosOk = (page: Page) =>
  page.route(ROTA_HORARIOS, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
    }),
  )

async function escolher(page: Page, nome: string) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: nome }) })
    .click()
}

/** Espera a transição entre passos terminar (o passo antigo sai, o novo entra). */
const assentar = (page: Page) => page.waitForTimeout(900)

test.describe('/agendar', () => {
  test('passo 1: serviço', async ({ page }) => {
    await page.goto('/agendar')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await assentar(page)
    await varrer(page, 'agendar, passo 1')
  })

  test('passo 2: barbeiro', async ({ page }) => {
    await page.goto('/agendar?combo=essencial')
    await assentar(page)
    await varrer(page, 'agendar, passo 2')
  })

  test('passo 3: data e horários', async ({ page }) => {
    await horariosOk(page)
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
    await assentar(page)
    await varrer(page, 'agendar, passo 3')
  })

  test('passo 4: dados', async ({ page }) => {
    await horariosOk(page)
    await page.goto('/agendar?combo=essencial&barbeiro=rafael')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolher(page, '09:00')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await assentar(page)
    await varrer(page, 'agendar, passo 4')
  })

  test('passo 4 com erro de validação', async ({ page }) => {
    await horariosOk(page)
    await page.goto('/agendar?combo=essencial&barbeiro=rafael')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolher(page, '09:00')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Seus dados' })).toBeVisible()
    await page.getByLabel('Nome').fill('J')
    await page.getByLabel('WhatsApp').fill('123')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await assentar(page)
    await varrer(page, 'agendar, passo 4 com erro de campo')
  })

  async function ateARevisao(page: Page) {
    await horariosOk(page)
    await page.goto('/agendar?combo=essencial&barbeiro=rafael')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await escolher(page, '09:00')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel('Nome').fill('João Silva')
    await page.getByLabel('WhatsApp').fill('11999998888')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await assentar(page)
  }

  test('passo 5: revisão', async ({ page }) => {
    await ateARevisao(page)
    await varrer(page, 'agendar, passo 5')
  })

  test('sucesso', async ({ page }) => {
    await ateARevisao(page)
    await page.route(ROTA_CRIAR, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) }),
    )
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { name: /Horário reservado/ })).toBeVisible()
    await assentar(page)
    await varrer(page, 'agendar, sucesso')
  })

  test('estado de erro (servidor fora no passo 3)', async ({ page }) => {
    await page.route(ROTA_HORARIOS, (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'boom', code: 'XX000' }),
      }),
    )
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.getByRole('alert')).toContainText('Algo deu errado do nosso lado')
    await assentar(page)
    await varrer(page, 'agendar, erro')
  })

  test('estado de erro na criação (servidor fora na revisão)', async ({ page }) => {
    await ateARevisao(page)
    await page.route(ROTA_CRIAR, (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'boom', code: 'XX000' }),
      }),
    )
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('group', { name: /Sem conexão|Algo deu errado|aguardando/ })).toBeVisible()
    await assentar(page)
    await varrer(page, 'agendar, erro na criação')
  })
})

// ---------------------------------------------------------------
// /painel
// ---------------------------------------------------------------

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-a11y')

test.describe('painel: login', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('tela de login', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, login')
  })

  test('tela de login com erro de senha', async ({ page }) => {
    test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
    await page.goto('/painel')
    await page.getByLabel('E-mail').fill(EMAIL!)
    await page.getByLabel('Senha').fill('senha-errada-a11y')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    // Login real: o botão fica desabilitado ('Entrando') até a resposta e volta ao neon por uma transição de cor.
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    await varrer(page, 'painel, login com erro')
  })
})

const DIA = '2026-11-04' // quarta
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }
const BARBEIROS = Object.entries(NOME).map(([id, nome]) => ({ id, nome }))
const sp = (hhmm: string) => `${DIA}T${hhmm}:00-03:00`

let contador = 0
function ag(barbeiro: string, de: string, ate: string, status: string, cliente: string, servico = 'Corte') {
  contador++
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `T${String(contador).padStart(5, '0')}`,
    status,
    inicio: sp(de),
    fim: sp(ate),
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

const AGENDA = [
  ag(B1, '09:00', '09:40', 'pendente', 'Ana Pendente'),
  ag(B1, '10:00', '11:00', 'confirmado', 'Bruno Confirmado', 'Combo Essencial'),
  ag(B2, '14:00', '14:30', 'concluido', 'Davi Concluido'),
  ag(B2, '15:00', '15:15', 'nao_compareceu', 'Edu Faltou'),
  ag(B3, '11:00', '11:40', 'cancelado', 'Carla Cancelada'),
]
const BLOQUEIOS = [bloqueio(null, '12:00', '13:00', 'Almoço da equipe'), bloqueio(B3, '16:00', '18:00', 'Folga do Caio')]

async function simular(page: Page) {
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json(BLOQUEIOS)))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => r.fulfill(json(AGENDA)))
}

test.describe('painel: logado', () => {
  test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
  test.use({ storageState: ESTADO })

  test.beforeAll(async ({ browser }, info) => {
    if (!temConta) return
    await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
  })

  test('Dia com agendamentos', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.locator('section[id^="coluna-"] button[aria-label*="Ana Pendente"]')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, dia')
  })

  test('Dia com cancelados visíveis', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(page.locator('section[id^="coluna-"] button[aria-label*="Ana Pendente"]')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, dia com cancelados')
  })

  test('Dia com o diálogo aberto', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await page.locator('section[id^="coluna-"] button[aria-label*="Bruno Confirmado"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, dialogo de agendamento')
  })

  test('Dia com o diálogo de novo bloqueio', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: /Bloquear horário/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, dialogo de bloqueio')
  })

  test('Dia vazio', async ({ page }) => {
    await simularEquipe(page)
    await page.route('**/rest/v1/barbeiros*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BARBEIROS) }),
    )
    await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/rest/v1/rpc/listar_agenda*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByText('Nenhum agendamento neste dia.')).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, dia vazio')
  })

  test('Dia com erro', async ({ page }) => {
    await simularEquipe(page)
    await page.route('**/rest/v1/barbeiros*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BARBEIROS) }),
    )
    await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/rest/v1/rpc/listar_agenda*', (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
    )
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('alert')).toContainText('Não deu para carregar a agenda.')
    await varrer(page, 'painel, dia com erro')
  })

  test('Semana', async ({ page }) => {
    await simular(page)
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda da semana' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Dias da semana' })).toBeVisible()
    await assentar(page)
    await varrer(page, 'painel, semana')
  })
})
