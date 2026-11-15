import type { Page } from '@playwright/test'
import sharp from 'sharp'

// Contraste de texto sobre foto, gradiente ou sobreposição, medido em PIXELS.
// O axe não consegue medir esses casos (devolve "incomplete"). Para cada elemento:
//   B  = a caixa do texto com TODO o texto da página apagado (só o fundo);
//   C1 = a mesma caixa com o texto do elemento pintado de preto puro;
//   C2 = a mesma caixa com o texto do elemento pintado de branco puro.
// Em cada pixel, a cobertura de letra é alfa = (C2 - C1) / 255 (se não há letra ali, C1 = C2 = fundo).
// "Pixel do texto" = alfa >= 0,9. O pior fundo é o de B nesses pixels. Como a máscara vem das duas
// sondas, e não da cor do texto, ela acha a letra mesmo quando ela tem a cor do fundo (o pior caso).
//
// LIMITES da medida (a conferir no olho quando algo parecer estranho):
//  - Percentil: usa o fundo no percentil 99,5% (texto claro) ou 0,5% (texto escuro), não o extremo.
//    Um grão de filme isolado não reprova; uma mancha atrás das letras reprova.
//  - Usa a cor calculada do texto. Opacidade de ancestrais (opacity < 1) NÃO entra na conta: um texto
//    esmaecido por opacidade teria contraste menor que o medido.
//  - "Coberto" é decidido só pelo ponto central da caixa (elementFromPoint): um elemento coberto só em
//    parte conta como visível.
//  - Animações CSS ficam pausadas durante a medida (o fundo fica como na tela); as de JavaScript (Motion: marquee,
//    parallax) não dá para pausar, então a medida é repetida até 4 vezes se o fundo mexer entre as fotos
//    e vira "instavel" (reprova) se nunca assentar.
//  - A cor do texto (lt, usada na razão) vem só do elemento alvo: um filho com outra cor (ex.: <span> neon
//    dentro de um parágrafo cinza) não é considerado. Meça o filho com o seletor dele.
//  - Só o texto do próprio elemento (não o ::before/::after dele, como o "/" neon da lista) é medido.
// Não é um arquivo de teste (não termina em .spec.ts).

export type Situacao =
  | 'medido'
  /** Dentro de aria-hidden (palavra vazada e afins): decoração pura, fora da conta. */
  | 'decorativo'
  /** Sem caixa dentro da janela agora. */
  | 'fora-da-tela'
  /** O ponto central da caixa mostra outro elemento (ex.: post de baixo da pilha de combos). */
  | 'coberto'
  | 'nao-encontrado'
  /** A caixa está visível e tem texto, mas nenhuma letra foi pintada nela (ex.: opacity 0). Reprova. */
  | 'sem-pixels'
  /** O fundo mexeu entre as fotos nas 4 tentativas. Reprova. */
  | 'instavel'

export interface Medida {
  seletor: string
  texto: string
  /** Onde o elemento mora (aria-label do post ou id da seção) + o texto: identifica o mesmo texto entre cenas. */
  chave: string
  situacao: Situacao
  contraste?: number
  minimo?: number
  /** Cor do texto e pior fundo, para a mensagem de erro. */
  detalhe?: string
}

interface Coletado {
  seletor: string
  texto: string
  chave: string
  situacao: Situacao
  cor: [number, number, number]
  grande: boolean
  caixa: { x: number; y: number; width: number; height: number }
}

/** Luminância relativa (WCAG) de uma cor com canais de 0 a 255. */
export function luminancia(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const ATRIBUTO = 'data-contraste-alvo'

// Só o TEXTO some (preenchimento, contorno, sombra, sublinhado); o resto da página fica como o visitante vê.
// Não se usa `color: transparent` nem `svg { visibility: hidden }`: eles apagariam também o que é desenhado com
// currentColor (Listras neon, gradientes, palavras vazadas, setas, mapa) e o fundo medido sairia mais limpo que o real.
// Animações CSS ficam pausadas no quadro atual (não removidas), então o fundo continua igual ao da tela.
// Texto de SVG (<text>) usa `fill`, não a cor de texto: é tratado à parte.
const CSS_FUNDO =
  '*, *::before, *::after { -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; animation-play-state: paused !important } svg text, svg tspan { fill: transparent !important; stroke: transparent !important }'
// Mais o texto do alvo na cor da sonda. Seletor com atributo vence o "*" (mesma importância, mais específico).
// O `fill` só vale para <text> de SVG dentro do alvo (ou o próprio alvo): formas do SVG não mudam de cor.
const cssSonda = (cor: string) =>
  `${CSS_FUNDO} [${ATRIBUTO}], [${ATRIBUTO}] * { -webkit-text-fill-color: ${cor} !important } text[${ATRIBUTO}], text[${ATRIBUTO}] tspan, [${ATRIBUTO}] text, [${ATRIBUTO}] tspan { fill: ${cor} !important }`

async function foto(page: Page, caixa: Coletado['caixa']) {
  const png = await page.screenshot({ clip: caixa })
  return sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
}

/**
 * Mede o contraste dos elementos indicados (seletores CSS). Texto grande (24px ou mais, ou 18,66px em negrito)
 * precisa de 3:1; o resto, 4,5:1 (WCAG AA). Muda a página durante a medida e desfaz no fim.
 */
export async function medirContrasteEmPixels(page: Page, seletores: string[]): Promise<Medida[]> {
  const coletados: Coletado[] = await page.evaluate((lista) => {
    return lista.map((seletor): Coletado => {
      const vazio = {
        seletor,
        texto: '',
        chave: '',
        cor: [255, 255, 255] as [number, number, number],
        grande: false,
        caixa: { x: 0, y: 0, width: 0, height: 0 },
      }
      const el = document.querySelector(seletor)
      if (!el) return { ...vazio, situacao: 'nao-encontrado' }
      const texto = (el.textContent ?? '').trim().slice(0, 30)
      const dono = el.closest('article[aria-label]')?.getAttribute('aria-label') ?? el.closest('section[id], footer, header')?.id ?? el.closest('section, footer, header')?.tagName ?? '?'
      const chave = `${dono}|${texto}`
      if (el.closest('[aria-hidden="true"]')) return { ...vazio, texto, chave, situacao: 'decorativo' }
      const cs = getComputedStyle(el)
      // Caixa do TEXTO: une a caixa de cada nó de texto (um Range no elemento inteiro devolveria a de filhos de bloco).
      let l = Infinity
      let t = Infinity
      let r = -Infinity
      let b = -Infinity
      const nos = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = nos.nextNode(); n; n = nos.nextNode()) {
        if (!n.textContent?.trim()) continue
        const faixa = document.createRange()
        faixa.selectNodeContents(n)
        const f = faixa.getBoundingClientRect()
        if (f.width === 0 || f.height === 0) continue
        l = Math.min(l, f.left)
        t = Math.min(t, f.top)
        r = Math.max(r, f.right)
        b = Math.max(b, f.bottom)
      }
      if (!Number.isFinite(l)) return { ...vazio, texto, chave, situacao: 'fora-da-tela' }
      // Parte da caixa que está dentro da janela.
      const x = Math.max(0, l)
      const y = Math.max(0, t)
      const width = Math.min(innerWidth, r) - x
      const height = Math.min(innerHeight, b) - y
      if (width < 2 || height < 2) return { ...vazio, texto, chave, situacao: 'fora-da-tela' }
      const topo = document.elementFromPoint(x + width / 2, y + height / 2)
      if (!topo || !(el.contains(topo) || topo.contains(el))) return { ...vazio, texto, chave, situacao: 'coberto' }
      // Texto de SVG é pintado pelo `fill`; texto HTML, pela `color`.
      const pintura = el instanceof SVGElement && cs.fill.startsWith('rgb') ? cs.fill : cs.color
      const [cr, cg, cb] = (pintura.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number)
      const px = parseFloat(cs.fontSize)
      const negrito = parseInt(cs.fontWeight, 10) >= 700
      return {
        seletor,
        texto,
        chave,
        situacao: 'medido',
        cor: [cr, cg, cb],
        grande: px >= 24 || (px >= 18.66 && negrito),
        caixa: { x, y, width, height },
      }
    })
  }, seletores)

  const estilo = await page.addStyleTag({ content: CSS_FUNDO })
  const saida: Medida[] = []
  try {
    for (const c of coletados) {
      if (c.situacao !== 'medido') {
        saida.push({ seletor: c.seletor, texto: c.texto, chave: c.chave, situacao: c.situacao })
        continue
      }
      saida.push(await medirUm(page, estilo, c))
    }
  } finally {
    await estilo.evaluate((e) => (e as Element).remove())
  }
  return saida
}

async function medirUm(page: Page, estilo: Awaited<ReturnType<Page['addStyleTag']>>, c: Coletado): Promise<Medida> {
  const marcar = (ligado: boolean) =>
    page.evaluate(
      ([sel, attr, on]) => {
        const el = document.querySelector(sel as string)
        if (!el) return
        if (on) el.setAttribute(attr as string, '')
        else el.removeAttribute(attr as string)
      },
      [c.seletor, ATRIBUTO, ligado] as const,
    )
  const pintar = (css: string) => estilo.evaluate((e, texto) => ((e as HTMLStyleElement).textContent = texto), css)

  await marcar(true)
  try {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      await pintar(CSS_FUNDO)
      const fundo = await foto(page, c.caixa)
      await pintar(cssSonda('#000'))
      const preta = await foto(page, c.caixa)
      await pintar(cssSonda('#fff'))
      const branca = await foto(page, c.caixa)
      await pintar(CSS_FUNDO)
      const fundoDepois = await foto(page, c.caixa)

      const canais = fundo.info.channels
      const total = fundo.data.length / canais
      // O fundo mexeu entre a primeira e a última foto (parallax, marquee)? Então a máscara não vale: repete.
      let mudou = 0
      for (let i = 0; i < fundo.data.length; i += canais) {
        const d = Math.max(
          Math.abs(fundo.data[i] - fundoDepois.data[i]),
          Math.abs(fundo.data[i + 1] - fundoDepois.data[i + 1]),
          Math.abs(fundo.data[i + 2] - fundoDepois.data[i + 2]),
        )
        if (d > 8) mudou++
      }
      if (mudou / total > 0.005) {
        await page.waitForTimeout(250)
        continue
      }

      const lt = luminancia(...c.cor)
      const fundos: number[] = []
      for (let i = 0; i < fundo.data.length; i += canais) {
        const alfa = (branca.data[i] - preta.data[i] + branca.data[i + 1] - preta.data[i + 1] + branca.data[i + 2] - preta.data[i + 2]) / (3 * 255)
        if (alfa < 0.9) continue
        fundos.push(luminancia(fundo.data[i], fundo.data[i + 1], fundo.data[i + 2]))
      }
      if (fundos.length === 0) return { seletor: c.seletor, texto: c.texto, chave: c.chave, situacao: 'sem-pixels' }
      fundos.sort((x, y) => x - y)
      // Texto claro: o pior fundo é o mais claro. Texto escuro: o mais escuro.
      const p = lt > 0.4 ? 0.995 : 0.005
      const lf = fundos[Math.min(fundos.length - 1, Math.round(p * (fundos.length - 1)))]
      return {
        seletor: c.seletor,
        texto: c.texto,
        chave: c.chave,
        situacao: 'medido',
        contraste: (Math.max(lt, lf) + 0.05) / (Math.min(lt, lf) + 0.05),
        minimo: c.grande ? 3 : 4.5,
        detalhe: `texto rgb(${c.cor.join(',')}) L=${lt.toFixed(3)}, fundo atrás das letras L=${lf.toFixed(3)} (${fundos.length} px)`,
      }
    }
    return { seletor: c.seletor, texto: c.texto, chave: c.chave, situacao: 'instavel' }
  } finally {
    await marcar(false)
  }
}

/**
 * Medidas que reprovam, em texto para a mensagem do teste. Reprova: contraste abaixo do mínimo, e também
 * tudo que não foi medido de verdade (não encontrado, sem pixels, instável). Só passam sem medida os
 * decorativos (aria-hidden) e os "cobertos por outra cena" (fora da tela ou cobertos), que o teste declara
 * numa lista explícita em `cobertoPorOutraCena`.
 */
export function reprovadas(medidas: Medida[], cobertoPorOutraCena: (m: Medida) => boolean = () => false): string[] {
  const falhas: string[] = []
  for (const m of medidas) {
    const nome = `${m.texto} [${m.seletor.slice(-70)}]`
    if (m.situacao === 'medido') {
      if ((m.contraste ?? 0) < (m.minimo ?? 4.5)) {
        falhas.push(`${nome}: contraste ${m.contraste?.toFixed(2)} (mínimo ${m.minimo}) ${m.detalhe}`)
      }
    } else if (m.situacao === 'fora-da-tela' || m.situacao === 'coberto') {
      if (!cobertoPorOutraCena(m)) falhas.push(`${nome}: ${m.situacao} e fora da lista de cobertos por outra cena`)
    } else if (m.situacao !== 'decorativo') {
      falhas.push(`${nome}: ${m.situacao}`)
    }
  }
  return falhas
}

/** Chaves ("dono|texto") dos elementos indicados, para cruzar o que o axe mediu (passes) com o que foi medido em pixels. */
export function chavesDe(page: Page, seletores: string[]): Promise<string[]> {
  return page.evaluate((lista) => {
    return lista.flatMap((seletor) => {
      const el = document.querySelector(seletor)
      if (!el) return []
      const texto = (el.textContent ?? '').trim().slice(0, 30)
      const dono =
        el.closest('article[aria-label]')?.getAttribute('aria-label') ??
        el.closest('section[id], footer, header')?.id ??
        el.closest('section, footer, header')?.tagName ??
        '?'
      return [`${dono}|${texto}`]
    })
  }, seletores)
}
