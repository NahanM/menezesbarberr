import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from './ajudas-login.ts'

// QA do incremento 5.2 (polimento do painel). Login REAL uma vez; agenda SIMULADA com page.route (nada vai ao banco).

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-52-qa')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const DIA = '2026-11-04' // quarta: funciona 09:00-20:00
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }
const BARBEIROS = Object.entries(NOME).map(([id, nome]) => ({ id, nome }))

let contador = 0
function ag(barbeiro: string, dia: string, de: string, ate: string, status: string, cliente: string) {
  contador++
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `Q${String(contador).padStart(5, '0')}`,
    status,
    inicio: `${dia}T${de}:00-03:00`,
    fim: `${dia}T${ate}:00-03:00`,
    barbeiro_id: barbeiro,
    barbeiro_nome: NOME[barbeiro],
    servico_nome: 'Corte',
    servico_tipo: 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}
type Linha = ReturnType<typeof ag>

async function simular(page: Page, linhas: Linha[]) {
  const json = (corpo: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => {
    const { p_de, p_ate } = r.request().postDataJSON() as { p_de: string; p_ate: string }
    return r.fulfill(json(linhas.filter((l) => l.inicio.slice(0, 10) >= p_de && l.inicio.slice(0, 10) <= p_ate)))
  })
}

const bloco = (page: Page, nome: RegExp) => page.getByRole('button', { name: nome }).first()
const avisoVivo = (page: Page) => page.locator('p[aria-live="polite"][aria-atomic="true"]')
const filtro = (page: Page) => page.getByRole('button', { name: /^(Mostrar|Ocultar) cancelados/ })
const bloquear = (page: Page) => page.getByRole('button', { name: /Bloquear horário/ })
// Celular: uma coluna por vez (abas). Desktop: todas. Torna a coluna do barbeiro visível e a devolve.
async function coluna(page: Page, id: string, nome: string) {
  const aba = page.getByRole('tab', { name: new RegExp(nome) })
  if (await aba.count()) await aba.click()
  return page.locator(`#coluna-${id}`)
}
const horaDaCalha = (page: Page, hhmm: string) => page.locator('div[aria-hidden="true"] > .relative > span', { hasText: new RegExp(`^${hhmm}$`) })
const primeiraHora = (page: Page) => page.locator('div[aria-hidden="true"] > .relative > span').first()
const ultimaHora = (page: Page) => page.locator('div[aria-hidden="true"] > .relative > span:not(.bg-neon)').last()

test.describe('1. texto da coluna sem agendamentos visíveis', () => {
  test('só cancelados escondidos: "N cancelados ocultos"; nada: "Sem agendamentos"; singular com 1', async ({ page }) => {
    await simular(page, [
      ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'),
      ag(B3, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Onze'),
      ag(B3, DIA, '12:00', '12:30', 'cancelado', 'Cancelado Doze'),
      ag(B2, DIA, '14:00', '14:30', 'cancelado', 'Cancelado Catorze'),
    ])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(await coluna(page, B3, 'Caio')).toContainText('2 cancelados ocultos')
    await expect(page.locator(`#coluna-${B3}`)).not.toContainText('Sem agendamentos')
    await expect(await coluna(page, B2, 'Diego')).toContainText('1 cancelado oculto')
    await expect(page.locator(`#coluna-${B2}`)).not.toContainText('1 cancelados')
    // Ligado: a frase some e o cancelado aparece.
    await filtro(page).click()
    await expect(page.getByText(/cancelados? ocultos?$/)).toHaveCount(0)
    await expect(bloco(page, /Cancelado Catorze/)).toBeVisible()
  })

  test('coluna sem nada (nem cancelado): "Sem agendamentos"', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'), ag(B3, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Onze')])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    const diego = await coluna(page, B2, 'Diego')
    await expect(diego).toContainText('Sem agendamentos')
    await expect(diego).not.toContainText('ocult')
    // Rafael tem agendamento: nenhuma das frases.
    const rafael = await coluna(page, B1, 'Rafael')
    await expect(rafael).not.toContainText('Sem agendamentos')
    await expect(rafael).not.toContainText('ocult')
  })

  test('com o filtro ligado a coluna sem nada continua "Sem agendamentos" (não "0 cancelados ocultos")', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'), ag(B3, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Onze')])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(await coluna(page, B2, 'Diego')).toContainText('Sem agendamentos')
    await expect(page.locator(`#coluna-${B2}`)).not.toContainText('0 cancelados')
  })
})

test.describe('2. botão de cancelados e região aria-live', () => {
  test('rótulo alterna Mostrar (N) / Ocultar (N) e a frase vai para a região aria-live', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'), ag(B1, DIA, '11:00', '11:30', 'cancelado', 'C1'), ag(B3, DIA, '11:00', '11:30', 'cancelado', 'C2')])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(filtro(page)).toHaveText('Mostrar cancelados (2)')
    await expect(filtro(page)).not.toHaveAttribute('aria-pressed', /.*/)
    await expect(avisoVivo(page)).toHaveText('')
    await filtro(page).click()
    await expect(filtro(page)).toHaveText('Ocultar cancelados (2)')
    await expect(avisoVivo(page)).toHaveText('Cancelados visíveis: 2')
    await expect(filtro(page)).toBeFocused() // há cancelados: o botão fica e mantém o foco
    await filtro(page).click()
    await expect(filtro(page)).toHaveText('Mostrar cancelados (2)')
    await expect(avisoVivo(page)).toHaveText('Cancelados ocultos')
    await expect(filtro(page)).toBeFocused()
  })

  test('?cancelados=1 em dia sem cancelados: "Ocultar cancelados" (sem "(0)"); clicar leva o foco a "Bloquear horário"', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(filtro(page)).toHaveText('Ocultar cancelados')
    await filtro(page).click()
    await expect(filtro(page)).toHaveCount(0)
    await expect(bloquear(page)).toBeFocused()
    await expect(avisoVivo(page)).toHaveText('Cancelados ocultos')
    await expect(page).not.toHaveURL(/cancelados/)
  })

  test('o aviso do filtro some ao trocar de dia', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '11:00', '11:30', 'cancelado', 'C1')])
    await page.goto(`/painel?dia=${DIA}`)
    await filtro(page).click()
    await expect(avisoVivo(page)).toHaveText('Cancelados visíveis: 1')
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(avisoVivo(page)).toHaveText('')
  })
})

test.describe('3. cancelado fora do expediente estende a faixa de horas', () => {
  test('antes da abertura (07:30) e depois do fechamento (21:15): só com o filtro ligado', async ({ page }) => {
    await simular(page, [
      ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'),
      ag(B1, DIA, '07:30', '08:00', 'cancelado', 'Cancelado Cedo'),
      ag(B1, DIA, '21:15', '21:45', 'cancelado', 'Cancelado Tarde'),
    ])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(primeiraHora(page)).toHaveText('09:00')
    await expect(ultimaHora(page)).toHaveText('19:00')
    await expect(page.getByRole('button', { name: /Cancelado (Cedo|Tarde)/ })).toHaveCount(0)
    await filtro(page).click()
    await expect(bloco(page, /Cancelado Cedo/)).toBeVisible()
    await expect(bloco(page, /Cancelado Tarde/)).toBeVisible()
    await expect(primeiraHora(page)).toHaveText('07:00')
    await expect(ultimaHora(page)).toHaveText('21:00')
    // Os dois ficam inteiros dentro da coluna (não recortados).
    const col = (await page.locator('.linhas-de-hora').first().boundingBox())!
    for (const n of [/Cancelado Cedo/, /Cancelado Tarde/]) {
      const b = (await bloco(page, n).boundingBox())!
      expect(b.y).toBeGreaterThanOrEqual(col.y - 1)
      expect(b.y + b.height).toBeLessThanOrEqual(col.y + col.height + 1)
    }
    await filtro(page).click()
    await expect(primeiraHora(page)).toHaveText('09:00')
    await expect(ultimaHora(page)).toHaveText('19:00')
  })

  test('cancelado que cruza o fechamento (19:45-20:30) estende até 21:00 só com filtro', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'), ag(B1, DIA, '19:45', '20:30', 'cancelado', 'Cancelado Borda')])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, /Cancelado Borda/)).toBeVisible()
    await expect(ultimaHora(page)).toHaveText('20:00')
  })
})

test.describe('4. folha "Bloquear horário" a 360x640', () => {
  test('rolar até o fim e percorrer com Tab: botão sempre na viewport e foco nunca atrás do rodapé', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await bloquear(page).click()
    const d = page.getByRole('dialog')
    await expect(d).toBeVisible()
    const criar = d.getByRole('button', { name: 'Bloquear', exact: true })
    await expect(criar).toBeVisible()
    // A folha sobe com animação (folha-sobe): mede só depois que ela terminou.
    await expect.poll(() => d.evaluate((el) => el.getAnimations().length)).toBe(0)

    const naViewport = async () => {
      const c = (await criar.boundingBox())!
      expect(c.y, 'botão acima da viewport').toBeGreaterThanOrEqual(0)
      expect(c.y + c.height, 'botão abaixo da viewport').toBeLessThanOrEqual(640)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(360)
    }
    await naViewport() // no topo da folha
    // A folha é o contêiner de rolagem: leva ao fim.
    const rolavel = await d.evaluate((el) => el.scrollHeight > el.clientHeight)
    await d.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await naViewport()
    await d.evaluate((el) => el.scrollTo({ top: 0 }))
    await naViewport()
    expect(rolavel, 'a folha deveria precisar de rolagem a 360x640 (senão o teste não prova nada)').toBe(true)

    // Tab por todos os campos, duas voltas.
    const visitados = new Set<string>()
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(60)
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const dialog = document.querySelector('dialog[open]')
        const rodape = dialog?.querySelector('button[type="submit"]')?.parentElement
        if (!el || !dialog || !rodape) return null
        const e = el.getBoundingClientRect()
        const f = rodape.getBoundingClientRect()
        return {
          nome: el.id || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 25) || el.tagName,
          dentro: dialog.contains(el),
          noRodape: rodape.contains(el),
          topo: e.top,
          base: e.bottom,
          rodapeTopo: f.top,
          rodapeBase: f.bottom,
        }
      })
      expect(r, 'diálogo/rodapé não encontrados').not.toBeNull()
      expect(r!.dentro, `foco escapou do diálogo em "${r!.nome}"`).toBe(true)
      visitados.add(r!.nome)
      expect(r!.rodapeBase, 'rodapé fora da viewport').toBeLessThanOrEqual(640 + 1)
      expect(r!.rodapeTopo, 'rodapé fora da viewport').toBeGreaterThanOrEqual(0)
      if (!r!.noRodape) {
        expect(r!.base, `"${r!.nome}" ficou atrás do rodapé sticky (base ${r!.base} > topo do rodapé ${r!.rodapeTopo})`).toBeLessThanOrEqual(r!.rodapeTopo + 1)
        expect(r!.topo, `"${r!.nome}" ficou acima da viewport`).toBeGreaterThanOrEqual(-1)
      }
      await naViewport()
    }
    for (const id of ['bloq-barbeiro', 'bloq-dia', 'bloq-inicio', 'bloq-fim', 'bloq-motivo']) {
      if (id === 'bloq-barbeiro') continue // id pode variar; os demais são fixos
      expect(visitados.has(id), `Tab nunca chegou em #${id}`).toBe(true)
    }
    expect(visitados.has('Bloquear')).toBe(true)
  })

  test('com erro do servidor o rodapé cresce e o botão continua dentro da viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.route('**/rest/v1/rpc/criar_bloqueio*', (r) =>
      r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'falha qualquer', code: 'P0001' }) }),
    )
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await bloquear(page).click()
    const d = page.getByRole('dialog')
    await d.getByLabel('Quem').selectOption({ label: 'Barbearia toda' })
    await d.getByRole('button', { name: /Dia inteiro/ }).click()
    const criar = d.getByRole('button', { name: 'Bloquear', exact: true })
    await criar.click()
    await expect(d.getByRole('alert')).toBeVisible()
    for (const el of [criar, d.getByRole('alert')]) {
      const c = (await el.boundingBox())!
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y + c.height).toBeLessThanOrEqual(640)
    }
  })
})

test.describe('5. etiqueta neon da linha "agora"', () => {
  // Relógio simulado: 04/11/2026 em SP (UTC-3). Se a etiqueta usasse UTC, mostraria 3 horas a mais.
  async function irAgora(page: Page, isoUtc: string) {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date(isoUtc) })
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto('/painel')
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
  }
  const etiqueta = (page: Page) => page.locator('span.bg-neon', { hasText: /^\d\d:\d\d$/ })

  test('15:10 em SP (18:10Z): etiqueta "15:10", hora cheia 15:00 escondida, 14:00 e 16:00 visíveis, sr-only presente', async ({ page }) => {
    await irAgora(page, '2026-11-04T18:10:00Z')
    await expect(etiqueta(page)).toHaveCount(1)
    await expect(etiqueta(page)).toHaveText('15:10')
    await expect(horaDaCalha(page, '15:00')).toBeHidden()
    await expect(horaDaCalha(page, '14:00')).toBeVisible()
    await expect(horaDaCalha(page, '16:00')).toBeVisible()
    const sr = page.locator('p.sr-only', { hasText: 'Agora: 15:10' })
    await expect(sr).toHaveCount(1)
    await expect(sr).toHaveText('Agora: 15:10')
    // O texto escondido existe no DOM mas não ocupa lugar visual (sr-only = 1px).
    const caixa = await sr.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
    expect(caixa.w).toBeLessThanOrEqual(1)
    expect(caixa.h).toBeLessThanOrEqual(1)
  })

  test('14:55 em SP: a hora cheia seguinte (15:00) fica escondida; 14:00 não', async ({ page }) => {
    await irAgora(page, '2026-11-04T17:55:00Z')
    await expect(etiqueta(page)).toHaveText('14:55')
    await expect(horaDaCalha(page, '15:00')).toBeHidden()
    await expect(horaDaCalha(page, '14:00')).toBeVisible()
  })

  test('15:20 em SP: 15:00 volta a aparecer (fora da folga) e a etiqueta não a cobre', async ({ page }) => {
    await irAgora(page, '2026-11-04T18:20:00Z')
    await expect(etiqueta(page)).toHaveText('15:20')
    await expect(horaDaCalha(page, '15:00')).toBeVisible()
    const e = (await etiqueta(page).boundingBox())!
    const h = (await horaDaCalha(page, '15:00').boundingBox())!
    const cruza = e.y < h.y + h.height && e.y + e.height > h.y && e.x < h.x + h.width && e.x + e.width > h.x
    expect(cruza, 'etiqueta sobrepõe o número 15:00').toBe(false)
  })

  test('23:30 em SP (02:30Z de 05/11): grade só vai até 20h, então não há etiqueta nem texto "Agora"', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-05T02:30:00Z') })
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto('/painel') // hoje em SP ainda é 04/11
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(etiqueta(page)).toHaveCount(0)
    await expect(page.locator('p.sr-only', { hasText: /^Agora:/ })).toHaveCount(0)
  })

  test('em outro dia (não hoje) não há etiqueta', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-04T18:10:00Z') })
    await simular(page, [ag(B1, '2026-11-05', '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto('/painel?dia=2026-11-05')
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(etiqueta(page)).toHaveCount(0)
    await expect(page.locator('p.sr-only', { hasText: /^Agora:/ })).toHaveCount(0)
  })
})

test.describe('6. Semana: coluna de hoje alinhada', () => {
  test('o topo do conteúdo de todos os cartões tem o mesmo y (desktop, 7 colunas)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'colunas lado a lado só a partir de lg')
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-04T15:00:00Z') }) // quarta 12:00 SP
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'), ag(B1, '2026-11-06', '10:00', '10:30', 'pendente', 'Pendente Sex')])
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    const cartoes = page.getByRole('list', { name: 'Dias da semana' }).getByRole('link')
    await expect(cartoes).toHaveCount(7)
    await expect(page.locator('a[aria-current="date"]')).toHaveCount(1)
    const ys = await cartoes.evaluateAll((els) => els.map((a) => (a.firstElementChild as HTMLElement).getBoundingClientRect().y))
    const xs = await cartoes.evaluateAll((els) => els.map((a) => a.getBoundingClientRect().x))
    expect(new Set(xs).size, 'os 7 cartões deveriam estar lado a lado').toBe(7)
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 0)
    // O cartão de hoje continua marcado com a faixa neon no topo.
    const borda = await page.locator('a[aria-current="date"]').evaluate((el) => getComputedStyle(el).borderTopColor)
    const bordaOutro = await cartoes.first().evaluate((el) => getComputedStyle(el).borderTopColor)
    expect(borda).not.toBe(bordaOutro)
    // Sem rolagem horizontal.
    const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
    expect(l).toBeLessThanOrEqual(v)
  })

  test('hoje no primeiro e no último dia da semana (segunda e domingo) também alinha', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'colunas lado a lado só a partir de lg')
    for (const hojeUtc of ['2026-11-02T15:00:00Z', '2026-11-08T15:00:00Z']) {
      await manterSessaoComRelogioSimulado(page)
      await page.clock.install({ time: new Date(hojeUtc) })
      await simular(page, [])
      await page.goto(`/painel?visao=semana&dia=${hojeUtc.slice(0, 10)}`)
      const cartoes = page.getByRole('list', { name: 'Dias da semana' }).getByRole('link')
      await expect(cartoes).toHaveCount(7)
      await expect(page.locator('a[aria-current="date"]')).toHaveCount(1)
      const ys = await cartoes.evaluateAll((els) => els.map((a) => (a.firstElementChild as HTMLElement).getBoundingClientRect().y))
      for (const y of ys) expect(y).toBeCloseTo(ys[0], 0)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    }
  })

  test('celular (lista vertical): cartão de hoje mantém a barra lateral neon e sem rolagem horizontal', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'só no celular')
    await manterSessaoComRelogioSimulado(page)
    await page.clock.install({ time: new Date('2026-11-04T15:00:00Z') })
    await simular(page, [])
    await page.goto(`/painel?visao=semana&dia=${DIA}`)
    const hoje = page.locator('a[aria-current="date"]')
    await expect(hoje).toHaveCount(1)
    expect(await hoje.evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth))).toBe(4)
    const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
    expect(l).toBeLessThanOrEqual(v)
  })
})
