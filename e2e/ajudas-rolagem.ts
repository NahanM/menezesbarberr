import type { Page } from '@playwright/test'
import {
  COMBOS_ENTRADA,
  COMBOS_PAUSA,
  COMBOS_SAIDA,
  FRASES_ENTRADA,
  FRASES_PAUSA,
  FRASES_RESPIRO,
  FRASES_SOBREPOSICAO,
  FRASES_SAIDA,
} from '../src/config/scroll.ts'
import { linhaDoTempoFrases, linhaDoTempoPosts } from '../src/lib/trechosDeRolagem.ts'

// Ajudas dos testes de rolagem da sequência "Você cuida do carro..." e dos combos.
// Não é um arquivo de teste (não termina em .spec.ts). Os trechos vêm da mesma config do site:
// se o dono ajustar src/config/scroll.ts, os testes acompanham.

export const ALTURA_HEADER = 64
export const FRASES = ['Você cuida do carro.', 'Cuida do tênis.', 'E o visual?']
export const COMBOS_NOMES = ['Essencial', 'Cuidado Completo', 'Experiência Premium']
export const N_COMBOS = COMBOS_NOMES.length
/** A mola (useSpring) leva menos de 1 s para assentar; esta espera dá folga. */
export const ESPERA_MOLA = 900

export const LINHA_FRASES = linhaDoTempoFrases(FRASES.length, { entrada: FRASES_ENTRADA, pausa: FRASES_PAUSA, saida: FRASES_SAIDA }, FRASES_SOBREPOSICAO, FRASES_RESPIRO)
export const LINHA_COMBOS = linhaDoTempoPosts(N_COMBOS, { entrada: COMBOS_ENTRADA, pausa: COMBOS_PAUSA, saida: COMBOS_SAIDA })

export const SEQUENCIA = '#manutencao > div'
export const PILHA = '#combos > div:last-child'

/**
 * Espera a rolagem parar de verdade. O Lenis anda por vários quadros depois do evento e pode ficar
 * parado por um instante no meio do trecho, então só vale como "parou" quando as duas coisas acontecem:
 * o Lenis tirou a classe `lenis-scrolling` do <html> (ele a remove ao terminar) e o scrollY ficou igual
 * em 3 leituras seguidas (~360 ms). Sem Lenis (celular) a classe nunca existe e vale só o scrollY.
 */
export async function assentar(page: Page) {
  let anterior = Number.NaN
  let iguais = 0
  for (let i = 0; i < 60; i++) {
    const { y, rolando } = await page.evaluate(() => ({
      y: window.scrollY,
      rolando: document.documentElement.classList.contains('lenis-scrolling'),
    }))
    iguais = y === anterior && !rolando ? iguais + 1 : 0
    if (iguais >= 3) return y
    anterior = y
    await page.waitForTimeout(120)
  }
  return anterior
}

/**
 * A sequência de frases nasce na versão estática e só troca para a presa (sticky) depois do primeiro quadro
 * (`Manutencao`). A altura do trilho medida antes da troca é outra, e a rolagem calculada com ela cai em outro
 * ponto da linha do tempo (visto em a11y: duas frases em crossfade onde se esperava uma só). Antes de medir ou
 * rolar na sequência, espera a versão presa existir. Com reduced-motion a Manutencao fica na lista estática
 * (sem .sticky) para sempre: aí não há o que esperar. Fora disso o prazo é curto e o erro diz o que faltou.
 */
async function esperarSequenciaMontada(page: Page, seletor: string) {
  if (seletor !== SEQUENCIA) return
  if (await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
  await page
    .locator('#manutencao .sticky')
    .waitFor({ state: 'attached', timeout: 5_000 })
    .catch(() => {
      throw new Error('a sequência de frases não trocou para a versão presa (#manutencao .sticky) em 5 s')
    })
}

/**
 * Faixa da tela (fração da altura, de cima para baixo) em que o carimbo do preço é disparado: é o
 * `rootMargin: '0px 0px -10% 0px'` de useRevelarAoEntrar (src/hooks/useRevelarAoEntrar.ts). Se aquele
 * rootMargin mudar, esta constante tem de mudar junto.
 */
const FAIXA_DO_GATILHO = 0.9

/** Px rolados desde o início do container (0 = container logo abaixo do header). */
export function rolado(page: Page, seletor: string) {
  return page.evaluate(
    ([sel, hh]) => (hh as number) - (document.querySelector(sel as string) as HTMLElement).getBoundingClientRect().top,
    [seletor, ALTURA_HEADER] as const,
  )
}

/** Rolagem total do container (altura dele menos a tela presa): o trilho em px. */
export function trilhoPx(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel as string) as HTMLElement
    return el.offsetHeight - (el.firstElementChild?.nextElementSibling ?? el.firstElementChild)!.getBoundingClientRect().height
  }, seletor)
}

/** Vai (rolagem instantânea) até `r` px dentro do container e espera a mola assentar. */
export async function irParaRolado(page: Page, seletor: string, r: number, espera = ESPERA_MOLA) {
  await esperarSequenciaMontada(page, seletor)
  await page.evaluate(
    ([sel, hh, alvo]) => {
      const el = document.querySelector(sel as string) as HTMLElement
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (hh as number) + (alvo as number))
    },
    [seletor, ALTURA_HEADER, r] as const,
  )
  await assentar(page)
  await page.waitForTimeout(espera)
}

/** Vai até uma fração (0 a 1) do trilho do container. */
export async function irParaFracao(page: Page, seletor: string, fracao: number) {
  await esperarSequenciaMontada(page, seletor)
  await irParaRolado(page, seletor, fracao * (await trilhoPx(page, seletor)))
}

/** Frases da sequência cuja opacidade efetiva (produto dos ancestrais) passa de `minimo`. */
export function frasesAtivas(page: Page, minimo = 0.9) {
  return page.evaluate(
    ([frases, min]) => {
      const efetiva = (el: Element) => {
        let o = 1
        for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
        return o
      }
      return (frases as string[]).filter((f) => {
        const el = [...document.querySelectorAll('#manutencao p')].find((x) => x.textContent?.trim() === f)
        return el !== undefined && efetiva(el) > (min as number)
      })
    },
    [FRASES, minimo] as const,
  )
}

/** Opacidade efetiva de [frase 1, frase 2, frase 3, fechamento] (produto dos ancestrais; NaN se não existir). */
export function opacidadesDaSequencia(page: Page) {
  return page.evaluate((frases) => {
    const efetiva = (el: Element | undefined) => {
      let o = 1
      for (let n: Element | null = el ?? null; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
      return el ? o : Number.NaN
    }
    const ps = [...document.querySelectorAll('#manutencao p')]
    return [...frases.map((t) => efetiva(ps.find((x) => x.textContent?.trim() === t))), efetiva(ps.find((x) => x.textContent?.includes('também merece')))]
  }, FRASES)
}

/** Opacidade efetiva do fechamento ("Seu corte também merece manutenção."). */
export function opacidadeFechamento(page: Page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('#manutencao p')].find((x) => x.textContent?.includes('também merece'))!
    let o = 1
    for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return o
  })
}

/** Posições (y na tela) do topo de cada post de combo. */
export function topoDosPosts(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#combos article[aria-label^="Combo"]')].map(
      (a) => a.parentElement!.getBoundingClientRect().top,
    ),
  )
}

/**
 * Uma passada de dedo de verdade (eventos de toque pelo DevTools Protocol, como num aparelho).
 * `dy` negativo = dedo sobe = página desce.
 */
export async function passada(page: Page, dy: number, passos = 12) {
  const cdp = await page.context().newCDPSession(page)
  const x = 180
  const altura = page.viewportSize()?.height ?? 640
  const yIni = dy < 0 ? altura - 20 : 20
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: yIni }] })
  for (let i = 1; i <= passos; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: yIni + (dy * i) / passos }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/**
 * Espera a tela assentar antes de uma medida de cor (axe): nada animado muda mais, por 12 quadros seguidos.
 * Conta como "animado": (1) a opacidade inline posta pelo Motion (mola); (2) animação finita do navegador
 * (Web Animations e transições de CSS) em andamento, com alvo visível; e (3) a PAUSADA esperando o gatilho
 * (o carimbo do preço bate quando o IntersectionObserver avisa; antes disso ele fica pausado em opacidade 0 e
 * a opacidade "parada" enganava a espera) quando o alvo já está na faixa em que o observador dispara
 * (FAIXA_DO_GATILHO). Pausadas fora dessa faixa são o estado normal de quem ainda não
 * apareceu e não contam. Animação infinita (faixa em movimento) não conta. Falha se não assentar em 10 s.
 * Não exclui nada nem muda a regra: só mede depois que a tela assentou.
 */
export async function aguardarTelaAssentada(page: Page) {
  const { assentou, ainda } = await page.evaluate(
    (faixaDoGatilho) =>
      new Promise<{ assentou: boolean; ainda: string[] }>((resolver) => {
        const nome = (el: Element) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}`)
        const emAndamento = () =>
          document.getAnimations().filter((an) => {
            if (an.playState !== 'running' && an.playState !== 'paused') return false
            const t = an.effect?.getComputedTiming()
            if (!t || t.iterations === Infinity) return false
            const alvo = (an.effect as KeyframeEffect).target
            if (alvo === null) return false
            const r = alvo.getBoundingClientRect()
            const visivel = r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth
            const faixa = an.playState === 'paused' ? window.innerHeight * faixaDoGatilho : window.innerHeight
            return visivel && r.bottom > 0 && r.top < faixa
          })
        const animando = () => emAndamento().length
        const ler = () =>
          [...document.querySelectorAll<HTMLElement>('[style*="opacity"]')].map((el) => getComputedStyle(el).opacity).join('|')
        const limite = performance.now() + 10_000
        let anterior = ler()
        let iguais = 0
        const quadro = () => {
          const atual = ler()
          iguais = atual === anterior && animando() === 0 ? iguais + 1 : 0
          anterior = atual
          if (iguais >= 12) resolver({ assentou: true, ainda: [] })
          else if (performance.now() > limite) {
            const alvos = emAndamento().map((an) => nome((an.effect as KeyframeEffect).target!))
            resolver({ assentou: false, ainda: alvos.length > 0 ? alvos : ['opacidade inline mudando (style="opacity")'] })
          }
          else requestAnimationFrame(quadro)
        }
        requestAnimationFrame(quadro)
      }),
    FAIXA_DO_GATILHO,
  )
  if (!assentou) throw new Error(`a tela não assentou em 10 s; ainda animando: ${ainda.slice(0, 5).join(' | ')}`)
}
