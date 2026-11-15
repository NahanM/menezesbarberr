import { expect, test, type Locator, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// QA do F9: filtro "Mostrar cancelados" na grade do Dia. Login REAL; agenda SIMULADA com page.route (nada vai ao banco).

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const ESTADO = estadoDoWorker('painel-cancelados-qa')

test.skip(!temConta, 'E2E_EMAIL e E2E_SENHA não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const DIA = '2026-11-04'
const OUTRO = '2026-11-05'
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B3, nome: 'Caio' },
]
const NOME: Record<string, string> = { [B1]: 'Rafael', [B3]: 'Caio' }

let contador = 0
function ag(barbeiro: string, dia: string, hhmm: string, fimhhmm: string, status: string, cliente: string) {
  contador++
  return {
    id: `10000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    codigo: `Q${String(contador).padStart(5, '0')}`,
    status,
    inicio: `${dia}T${hhmm}:00-03:00`,
    fim: `${dia}T${fimhhmm}:00-03:00`,
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
  await page.route('**/rest/v1/rpc/mudar_status*', (r) => {
    const { p_id, p_status } = r.request().postDataJSON() as { p_id: string; p_status: string }
    const l = linhas.find((x) => x.id === p_id)!
    l.status = p_status
    return r.fulfill(json([l]))
  })
}

const base = (): Linha[] => [
  ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'),
  ag(B1, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Onze'),
  ag(B3, DIA, '12:00', '12:30', 'nao_compareceu', 'Faltou Doze'),
  ag(B3, DIA, '13:00', '13:30', 'cancelado', 'Cancelado Treze'),
]

const bloco = (page: Page, nome: RegExp) => page.getByRole('button', { name: nome }).first()
// Região aria-live (a mesma dos avisos de bloqueio): é onde o leitor de tela ouve o resultado do filtro.
const avisoVivo = (page: Page) => page.locator('p[aria-live="polite"][aria-atomic="true"]')
const filtro = (page: Page) => page.getByRole('button', { name: /^(Mostrar|Ocultar) cancelados/ })
// No celular a grade mostra um barbeiro por vez (abas); no desktop, todos. Tornar o Caio visível quando preciso.
async function verCaio(page: Page) {
  const aba = page.getByRole('tab', { name: /Caio/ })
  if (await aba.count()) await aba.click()
}
async function semRolagemHorizontal(page: Page) {
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)
}

test.describe('filtro de cancelados', () => {
  test('padrão: cancelados ocultos, "não compareceu" visível, botão "Mostrar cancelados (N)"', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}`)
    await expect(filtro(page)).toHaveText('Mostrar cancelados (2)')
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Cancelado Onze/ })).toHaveCount(0)
    await verCaio(page)
    await expect(bloco(page, /Faltou Doze/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Cancelado Treze/ })).toHaveCount(0)
  })

  test('ligar: o botão vira "Ocultar cancelados", URL ganha ?cancelados=1, cancelado aparece riscado; desligar remove o parâmetro', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}`)
    await filtro(page).click()
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
    await expect(page).toHaveURL(/dia=2026-11-04&cancelados=1$|cancelados=1/)
    const c = bloco(page, /Cancelado Onze/)
    await expect(c).toBeVisible()
    const risco = await c.getByText('Cancelado Onze').evaluate((el) => getComputedStyle(el).textDecorationLine)
    expect(risco).toContain('line-through')
    await filtro(page).click()
    await expect(filtro(page)).toHaveText(/^Mostrar cancelados/)
    expect(page.url()).not.toContain('cancelados')
    await expect(page.getByRole('button', { name: /Cancelado Onze/ })).toHaveCount(0)
  })

  test('recarregar com ?cancelados=1 mantém ligado', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
    await expect(bloco(page, /Cancelado Onze/)).toBeVisible()
    await page.reload()
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
  })

  for (const valor of ['0', 'true', 'abc', '', '2', '1%20', '1&cancelados=0', 'SIM', '%00', '<script>']) {
    test(`valor inválido ?cancelados=${valor || '(vazio)'}: desligado, sem erro de tela`, async ({ page }) => {
      await simular(page, base())
      await page.goto(`/painel?dia=${DIA}&cancelados=${valor}`)
      // "1&cancelados=0": o primeiro valor é "1" (URLSearchParams.get devolve o primeiro): ligado é aceitável.
      const esperado = valor.startsWith('1&') ? 'true' : 'false'
      await expect(filtro(page)).toHaveText(esperado === 'true' ? /^Ocultar cancelados/ : /^Mostrar cancelados/)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    })
  }

  test('parâmetro repetido ?cancelados=1&cancelados=0 não quebra', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1&cancelados=0`)
    await expect(filtro(page)).toBeVisible()
    await filtro(page).click()
    await expect(filtro(page)).toHaveText(/^(Mostrar|Ocultar) cancelados/)
  })

  test('trocar de dia (próximo dia) preserva o filtro ligado; desligado não aparece na URL', async ({ page }) => {
    const l = [...base(), ag(B1, OUTRO, '09:00', '09:30', 'cancelado', 'Cancelado Amanha'), ag(B1, OUTRO, '10:00', '10:30', 'confirmado', 'Ativo Amanha')]
    await simular(page, l)
    await page.goto(`/painel?dia=${DIA}`)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(page).toHaveURL(/dia=2026-11-05$/)
    await filtro(page).click()
    await page.getByRole('button', { name: 'Dia anterior' }).click()
    await expect(page).toHaveURL(/dia=2026-11-04&cancelados=1$/)
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
    await expect(bloco(page, /Cancelado Onze/)).toBeVisible()
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(bloco(page, /Cancelado Amanha/)).toBeVisible()
  })

  test('ir para a Semana e voltar pelo seletor de visão preserva o filtro', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page).toHaveURL(/visao=semana/)
    expect(page.url()).toContain('cancelados=1')
    await page.getByRole('button', { name: 'Dia', exact: true }).click()
    await expect(page).not.toHaveURL(/visao=semana/)
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
  })

  test('ir à Semana, abrir um dia pelo cartão: o filtro ligado se mantém?', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await page.getByRole('button', { name: 'Semana' }).click()
    await page.getByRole('list', { name: 'Dias da semana' }).getByRole('link', { name: /quarta, 04\/11/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
  })

  test('ir à Semana, seguir o link de pendentes do resumo: o filtro ligado se mantém e abre o dia do pendente', async ({ page }) => {
    await simular(page, [...base(), ag(B1, OUTRO, '15:00', '15:30', 'pendente', 'Pendente Cinco'), ag(B1, OUTRO, '16:00', '16:30', 'cancelado', 'Cancelado Cinco')])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page).toHaveURL(/visao=semana/)
    await page.getByRole('link', { name: /Ir ao primeiro dia com pendente/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agenda do dia')
    await expect(page).toHaveURL(/dia=2026-11-05/)
    expect(page.url()).toContain('cancelados=1')
    await expect(page).not.toHaveURL(/visao=semana/)
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
  })

  test('semana: o resumo e os cartões não mudam com o filtro (cancelado nunca conta)', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?visao=semana&dia=${DIA}&cancelados=1`)
    await expect(page.getByRole('region', { name: 'Resumo da semana' })).toContainText('1 agendado')
  })

  test('dia sem cancelados: o botão não existe; com ?cancelados=1 ele fica, para desligar o filtro', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(filtro(page)).toHaveCount(0)
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(filtro(page)).toHaveText('Ocultar cancelados')
  })

  test('dia vazio: sem botão e sem erro', async ({ page }) => {
    await simular(page, [])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(filtro(page)).toHaveCount(0)
  })

  test('dia só com cancelados: botão (2), grade sem blocos, ligar mostra os dois e o resumo segue 0', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'cancelado', 'Cancelado Um'), ag(B1, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Dois')])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(filtro(page)).toHaveText('Mostrar cancelados (2)')
    await expect(page.getByRole('button', { name: /Cancelado (Um|Dois)/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Resumo do dia' })).toContainText('0 agendados')
    await filtro(page).click()
    await expect(page.getByRole('button', { name: /Cancelado (Um|Dois)/ })).toHaveCount(2)
    await expect(page.getByRole('region', { name: 'Resumo do dia' })).toContainText('0 agendados')
  })

  test('cancelar com o filtro desligado: o diálogo continua aberto e o contador do botão sobe; ao fechar o foco não se perde', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}`)
    const b = bloco(page, /Ativo Dez/)
    await b.click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await dialogo.getByRole('button', { name: 'Cancelar agendamento' }).click()
    await dialogo.getByRole('button', { name: 'Confirmar cancelamento?' }).click()
    // O bloco sumiu da grade (filtro desligado), mas o diálogo segue aberto, agora mostrando "cancelado".
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole('heading', { level: 2 })).toBeFocused()
    await expect(dialogo).toContainText(/cancelado/i)
    await expect(filtro(page)).toHaveText('Mostrar cancelados (3)')
    await expect(page.getByRole('button', { name: /Ativo Dez/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    // Foco não pode ficar no <body>: o bloco que abriu desapareceu, o foco deve ir para algo útil.
    const alvo = await page.evaluate(() => {
      const el = document.activeElement
      return { tag: el?.tagName ?? '', nome: el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 40) ?? '' }
    })
    expect(alvo.tag, `foco perdido no body após fechar (ativo: ${JSON.stringify(alvo)})`).not.toBe('BODY')
  })

  test('cancelar com o filtro ligado: o bloco fica na grade e o foco volta a ele', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await bloco(page, /Ativo Dez/).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByRole('button', { name: 'Cancelar agendamento' }).click()
    await dialogo.getByRole('button', { name: 'Confirmar cancelamento?' }).click()
    // Espera o salvamento terminar (o foco vai ao título): durante ele o Escape é bloqueado de propósito.
    await expect(dialogo.getByRole('heading', { level: 2 })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    await expect(bloco(page, /Ativo Dez/)).toBeFocused()
  })

  test('abrir cancelado (filtro ligado), desligar o filtro com o diálogo aberto: o diálogo não quebra', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await bloco(page, /Cancelado Onze/).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await filtro(page).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('360px: sem rolagem horizontal com o botão e blocos cancelados', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(filtro(page)).toBeVisible()
    await semRolagemHorizontal(page)
    const c = await filtro(page).boundingBox()
    expect(c!.x).toBeGreaterThanOrEqual(0)
    expect(c!.x + c!.width).toBeLessThanOrEqual(360)
    expect(c!.height).toBeGreaterThanOrEqual(44)
    await filtro(page).click()
    await semRolagemHorizontal(page)
  })

  test('foco visível no botão do filtro e Enter/Espaço alternam', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}`)
    await filtro(page).focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(filtro(page)).toBeFocused()
    const o = await filtro(page).evaluate((el) => {
      const s = getComputedStyle(el)
      return { vis: el.matches(':focus-visible'), estilo: s.outlineStyle, w: parseFloat(s.outlineWidth) }
    })
    expect(o.vis).toBe(true)
    expect(o.estilo).not.toBe('none')
    expect(o.w).toBeGreaterThanOrEqual(2)
    await page.keyboard.press('Enter')
    await expect(filtro(page)).toHaveText(/^Ocultar cancelados/)
    await page.keyboard.press('Space')
    await expect(filtro(page)).toHaveText(/^Mostrar cancelados/)
  })
})

test.describe('cancelado na grade', () => {
  test('contraste real (cor efetiva com a opacidade) do nome, do status e do serviço do cancelado >= 4.5:1, em repouso e em hover', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    const c = bloco(page, /Cancelado Onze/)
    await expect(c).toBeVisible()
    await page.mouse.move(0, 0)
    const medir = () =>
      c.evaluate((botao) => {
        const rgba = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const mistura = (topo: number[], alfa: number, fundo: number[]) => [0, 1, 2].map((i) => topo[i] * alfa + fundo[i] * (1 - alfa))
        // Opacidade acumulada dos ancestrais (o wrapper do bloco) e o fundo opaco que está atrás de tudo.
        let opac = 1
        for (let e: Element | null = botao; e; e = e.parentElement) opac *= parseFloat(getComputedStyle(e).opacity)
        const wrapper = botao.parentElement!
        const atras = (() => {
          for (let e: Element | null = wrapper.parentElement; e; e = e.parentElement) {
            const c = rgba(getComputedStyle(e).backgroundColor)
            if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) return c.slice(0, 3)
          }
          return [0, 0, 0]
        })()
        const corFundoBloco = rgba(getComputedStyle(botao).backgroundColor).slice(0, 3)
        const fundoEfetivo = mistura(corFundoBloco, opac, atras)
        const saida: { texto: string; razao: number; opac: number }[] = []
        for (const el of botao.querySelectorAll('*')) {
          const proprio = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
          if (!proprio) continue
          const cor = rgba(getComputedStyle(el).color).slice(0, 3)
          const efetiva = mistura(cor, opac, atras)
          const [a, b] = [lum(efetiva), lum(fundoEfetivo)]
          saida.push({ texto: (el.textContent ?? '').trim(), razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), opac })
        }
        return saida
      })
    const repouso = await medir()
    expect(repouso.length).toBeGreaterThan(0)
    for (const m of repouso) expect(m.razao, `repouso "${m.texto}" (opac ${m.opac})`).toBeGreaterThanOrEqual(4.5)
    expect(repouso[0].opac).toBeCloseTo(0.7, 1)
    await c.hover()
    await page.waitForTimeout(400)
    for (const m of await medir()) expect(m.razao, `hover "${m.texto}"`).toBeGreaterThanOrEqual(4.5)
  })

  test('sobreposição: cancelado no mesmo horário do ativo; o ativo nunca fica coberto (ponto central e cantos)', async ({ page }) => {
    // Cancelado 10:00-10:30 e ativo 10:00-10:30 no mesmo barbeiro (horário liberado pelo cancelamento), mais um 10:15 parcial.
    const l = [
      ag(B1, DIA, '10:00', '10:30', 'cancelado', 'Cancelado Sobre'),
      ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Sobre'),
      ag(B1, DIA, '10:15', '10:45', 'cancelado', 'Cancelado Parcial'),
      ag(B1, DIA, '10:30', '11:00', 'pendente', 'Pendente Parcial'),
    ]
    await simular(page, l)
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    for (const nome of ['Ativo Sobre', 'Pendente Parcial']) {
      const b = bloco(page, new RegExp(nome))
      await expect(b).toBeVisible()
      await b.scrollIntoViewIfNeeded()
      const cx = await b.boundingBox()
      const pontos = [
        [cx!.x + cx!.width / 2, cx!.y + cx!.height / 2],
        [cx!.x + 6, cx!.y + 6],
        [cx!.x + cx!.width - 6, cx!.y + cx!.height - 6],
      ]
      for (const [x, y] of pontos) {
        const dono = await b.evaluate((el, [px, py]) => {
          const topo = document.elementFromPoint(px, py)
          return el.contains(topo)
        }, [x, y])
        expect(dono, `${nome} coberto em (${Math.round(x)},${Math.round(y)})`).toBe(true)
      }
    }
  })

  test('cancelado depois de ativo no DOM e antes no DOM: z-index sempre põe o ativo acima', async ({ page }) => {
    const l = [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Primeiro'), ag(B1, DIA, '10:00', '10:30', 'cancelado', 'Cancelado Depois')]
    await simular(page, l)
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    const b = bloco(page, /Ativo Primeiro/)
    await expect(b).toBeVisible()
    const box = await b.boundingBox()
    const ok = await page.evaluate(([x, y]) => {
      const t = document.elementFromPoint(x, y)
      return t?.closest('button')?.getAttribute('aria-label')?.includes('Ativo Primeiro') ?? false
    }, [box!.x + box!.width / 2, box!.y + box!.height / 2])
    expect(ok).toBe(true)
  })

  test('não compareceu fica sempre visível, com e sem filtro', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'nao_compareceu', 'Faltou Dez')])
    for (const q of ['', '&cancelados=1']) {
      await page.goto(`/painel?dia=${DIA}${q}`)
      await expect(bloco(page, /Faltou Dez/)).toBeVisible()
    }
  })

  test('cancelado ligado tem opacidade 0.7 e ativo opacidade 1', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, /Cancelado Onze/)).toBeVisible()
    await page.mouse.move(0, 0)
    const op = await bloco(page, /Cancelado Onze/).evaluate((el) => getComputedStyle(el.parentElement!).opacity)
    expect(Number(op)).toBeCloseTo(0.7, 1)
    const opAtivo = await bloco(page, /Ativo Dez/).evaluate((el) => getComputedStyle(el.parentElement!).opacity)
    expect(Number(opAtivo)).toBe(1)
  })
})

// Incremento 5.2 da Fase 5: coluna só com cancelados, botão com filtro ligado e faixa de horas com cancelados.
test.describe('polimento dos cancelados (5.2)', () => {
  test('coluna só com cancelados diz "N cancelados ocultos"; ligado, o cancelado aparece', async ({ page }) => {
    await simular(page, [
      ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'),
      ag(B3, DIA, '11:00', '11:30', 'cancelado', 'Cancelado Onze'),
      ag(B3, DIA, '12:00', '12:30', 'cancelado', 'Cancelado Doze'),
    ])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible() // a grade já carregou (no celular, só então as abas existem)
    await verCaio(page)
    const coluna = page.locator('section[id^="coluna-"]:visible').filter({ has: page.getByText('2 cancelados ocultos') })
    await expect(coluna).toHaveCount(1)
    await expect(page.getByText('Sem agendamentos')).toHaveCount(0)
    await filtro(page).click()
    await expect(page.getByText('2 cancelados ocultos')).toHaveCount(0)
    await expect(bloco(page, /Cancelado Onze/)).toBeVisible()
  })

  test('filtro ligado sem nenhum cancelado: o botão continua e desliga o filtro', async ({ page }) => {
    await simular(page, [ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez')])
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(filtro(page)).toHaveText('Ocultar cancelados')
    await filtro(page).focus()
    await page.keyboard.press('Enter')
    await expect(filtro(page)).toHaveCount(0) // desligado e sem cancelados: o botão sai
    await expect(page.getByRole('button', { name: /Bloquear horário/ })).toBeFocused() // e o foco não se perde
    await expect(avisoVivo(page)).toHaveText('Cancelados ocultos')
    await expect(page).not.toHaveURL(/cancelados/)
  })

  test('cancelado fora do expediente só entra na grade com o filtro ligado, ampliando a faixa de horas', async ({ page }) => {
    await simular(page, [
      ag(B1, DIA, '10:00', '10:30', 'confirmado', 'Ativo Dez'),
      ag(B1, DIA, '07:30', '08:00', 'cancelado', 'Cancelado Cedo'),
    ])
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await expect(bloco(page, /Cancelado Cedo/)).toHaveCount(0)
    const primeiraHora = () => page.locator('div[aria-hidden="true"] > .relative > span').first()
    await expect(primeiraHora()).toHaveText('09:00')
    await filtro(page).click()
    await expect(bloco(page, /Cancelado Cedo/)).toBeVisible()
    await expect(primeiraHora()).toHaveText('07:00') // a faixa de horas ampliou para caber o cancelado
    await filtro(page).click()
    await expect(bloco(page, /Cancelado Cedo/)).toHaveCount(0)
    await expect(primeiraHora()).toHaveText('09:00')
  })

  test('alternar o filtro anuncia o resultado na região aria-live', async ({ page }) => {
    await simular(page, base())
    await page.goto(`/painel?dia=${DIA}`)
    await expect(filtro(page)).toHaveText('Mostrar cancelados (2)')
    await expect(avisoVivo(page)).toHaveText('')
    await filtro(page).click()
    await expect(avisoVivo(page)).toHaveText('Cancelados visíveis: 2')
    await filtro(page).click()
    await expect(avisoVivo(page)).toHaveText('Cancelados ocultos')
  })

  test('360px: o botão Bloquear fica à vista com o erro do servidor no rodapé da folha', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await simular(page, base())
    await page.route('**/rest/v1/rpc/criar_bloqueio*', (r) =>
      r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'falha qualquer', code: 'P0001' }) }),
    )
    await page.goto(`/painel?dia=${DIA}`)
    await expect(bloco(page, /Ativo Dez/)).toBeVisible()
    await page.getByRole('button', { name: /Bloquear horário/ }).click()
    const d = page.getByRole('dialog')
    await d.getByLabel('Quem').selectOption({ label: 'Barbearia toda' })
    await d.getByRole('button', { name: /Dia inteiro/ }).click()
    await d.getByRole('button', { name: 'Bloquear', exact: true }).click()
    await expect(d.getByRole('alert')).toBeVisible()
    const naTela = async (el: Locator) => {
      const c = (await el.boundingBox())!
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y + c.height).toBeLessThanOrEqual(700)
    }
    await naTela(d.getByRole('button', { name: 'Bloquear', exact: true }))
    await naTela(d.getByRole('alert'))
  })
})
