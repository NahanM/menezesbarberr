import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import Lenis from 'lenis'
import { cancelFrame, frame } from 'motion/react'
import 'lenis/dist/lenis.css'
import { CONSULTA_DESKTOP, LENIS_LERP } from '../config/scroll.ts'

// Lenis só liga com mouse/trackpad em tela larga (CONSULTA_DESKTOP) e sem pedido de menos movimento.
// No celular e em reduced-motion fica a rolagem nativa.
const CONSULTA_REDUZIR = '(prefers-reduced-motion: reduce)'

// "#combos" vira "combos". Hash malformado (ex.: "#%E0") não pode derrubar a página.
function idDaAncora(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

// Não renderiza nada: liga o Lenis, volta ao topo a cada troca de rota
// e, quando a URL tem #id, rola até esse elemento.
export default function RolagemSuave() {
  const lenisRef = useRef<Lenis | null>(null)
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    const desktop = window.matchMedia(CONSULTA_DESKTOP)
    const reduzir = window.matchMedia(CONSULTA_REDUZIR)
    // Roda no mesmo ciclo de quadros do Motion (useScroll/useTransform): sem isso o Lenis
    // fica 1 quadro fora de sincronia e a rolagem engasga.
    let laco: Parameters<typeof cancelFrame>[0] | null = null

    const desligar = () => {
      if (laco) cancelFrame(laco)
      laco = null
      lenisRef.current?.destroy()
      lenisRef.current = null
    }

    const atualizar = () => {
      desligar()
      if (!desktop.matches || reduzir.matches) return
      // Lenis usa a rolagem nativa da window, então o useScroll do Motion segue funcionando.
      const lenis = new Lenis({ lerp: LENIS_LERP })
      lenisRef.current = lenis
      laco = ({ timestamp }) => lenis.raf(timestamp)
      // keepAlive (2º argumento): o laço roda todo quadro, não só quando o Motion pede.
      frame.update(laco, true)
    }

    atualizar()
    desktop.addEventListener('change', atualizar)
    reduzir.addEventListener('change', atualizar)
    return () => {
      desktop.removeEventListener('change', atualizar)
      reduzir.removeEventListener('change', atualizar)
      desligar()
    }
  }, [])

  // Troca de rota ou de âncora. Com #id rola até o elemento; sem, volta ao topo.
  // `key` muda a cada navegação, então clicar duas vezes no mesmo link também rola.
  useEffect(() => {
    const lenis = lenisRef.current
    const alvo = hash ? document.getElementById(idDaAncora(hash)) : null

    if (alvo) {
      if (lenis) {
        // O Lenis já desconta o scroll-margin-top do alvo (para parar abaixo do Header): não somar de novo.
        lenis.scrollTo(alvo)
      } else {
        alvo.scrollIntoView() // respeita o scroll-margin-top da seção
      }
      return
    }
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname, hash, key])

  return null
}
