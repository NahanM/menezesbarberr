import { useLayoutEffect, type RefObject } from 'react'

// Lê um token do tema (--ease-urbz). Se faltar, usa o padrão.
function token(nome: string, padrao: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
  return valor || padrao
}

// Lê uma duração do tema em milissegundos. Aceita "900ms" e "0.9s"; qualquer outra coisa
// cai no padrão (nunca vira 0,9 ms em silêncio).
function duracaoEmMs(nome: string, padraoMs: number): number {
  const texto = token(nome, '')
  const m = /^([\d.]+)(ms|s)$/.exec(texto)
  if (!m) return padraoMs
  const numero = parseFloat(m[1])
  if (!Number.isFinite(numero)) return padraoMs
  return m[2] === 's' ? numero * 1000 : numero
}

// Rede de segurança: de quanto em quanto tempo conferimos se o gatilho já está na tela
// sem o IntersectionObserver ter avisado.
const CONFERIR_A_CADA_MS = 2500

function estaNaTela(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
}

/**
 * Revela um elemento quando o gatilho entra na tela, sem nunca deixá-lo invisível "de graça".
 *
 * Como garante visibilidade:
 * - O HTML renderiza o elemento já visível (sem JS, ele aparece).
 * - Só depois, antes da primeira pintura (useLayoutEffect), criamos uma animação PAUSADA
 *   (Web Animations API) cujo primeiro quadro é o estado "escondido". Ela só é criada se
 *   o navegador tem IntersectionObserver e a pessoa não pediu menos movimento.
 * - Quando o gatilho entra na tela, a animação toca. Ao terminar (ou se der erro),
 *   `cancel()` devolve o elemento ao estado natural: visível.
 * - Rede de segurança: se o gatilho já está na tela e o observador nunca avisou, um timer
 *   cancela a animação e o elemento fica visível. Se o gatilho ainda está fora da tela
 *   (esperando a rolagem), o timer só confere de novo depois.
 *
 * `criarKeyframes` precisa ser uma função estável (declarada fora do componente).
 */
export function useRevelarAoEntrar(
  alvo: RefObject<HTMLElement | null>,
  gatilho: RefObject<HTMLElement | null>,
  criarKeyframes: (alvo: HTMLElement) => Keyframe[],
  atrasoMs = 0,
): void {
  useLayoutEffect(() => {
    const elemento = alvo.current
    const observado = gatilho.current
    if (!elemento || !observado) return
    if (typeof IntersectionObserver === 'undefined' || typeof elemento.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let animacao: Animation
    try {
      animacao = elemento.animate(criarKeyframes(elemento), {
        duration: duracaoEmMs('--duration-lenta', 900),
        easing: token('--ease-urbz', 'cubic-bezier(0.22, 1, 0.36, 1)'),
        delay: atrasoMs,
        fill: 'both',
      })
      animacao.pause() // parada no primeiro quadro (escondido) até o gatilho aparecer
    } catch {
      return
    }

    let timer = 0
    const terminar = () => animacao.cancel()
    animacao.onfinish = terminar

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return
        observador.disconnect()
        clearTimeout(timer)
        try {
          animacao.play()
        } catch {
          terminar()
        }
      },
      // threshold 0 + margem: dispara mesmo para elementos mais altos que a tela.
      { threshold: 0, rootMargin: '0px 0px -10% 0px' },
    )
    observador.observe(observado)

    const conferir = () => {
      if (estaNaTela(observado)) {
        observador.disconnect()
        terminar() // observador falhou: melhor sem animação do que escondido
      } else {
        timer = window.setTimeout(conferir, CONFERIR_A_CADA_MS)
      }
    }
    timer = window.setTimeout(conferir, CONFERIR_A_CADA_MS)

    return () => {
      clearTimeout(timer)
      observador.disconnect()
      animacao.cancel()
    }
  }, [alvo, gatilho, criarKeyframes, atrasoMs])
}
