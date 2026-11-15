import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { HERO_ALTURA, HERO_CAMADAS, HERO_LARGURA } from '../../data/hero.ts'

// Topo em 3 camadas (fundo desfocado, cadeira, bancada) que dão sensação de profundidade.
// O visual e os números ficam no CSS (styles/index.css, bloco "TOPO EM CAMADAS"). Aqui fica só o movimento.
// Dois modos, nunca os dois ao mesmo tempo:
// - modo-mouse (computador com mouse e tela de 840 px ou mais): as camadas seguem o cursor com atraso;
// - modo-rolagem (celular e telas estreitas): as camadas sobem conforme a página rola.
// Com prefers-reduced-motion nada é ligado: sem modo, sem animação de entrada, camadas paradas.
export default function Hero() {
  const topoRef = useRef<HTMLElement>(null)
  const fundoRef = useRef<HTMLImageElement>(null)

  // useLayoutEffect (e não useEffect): as classes de entrada precisam existir antes da primeira pintura,
  // senão o texto apareceria no lugar e "pularia" para o começo da animação.
  useLayoutEffect(() => {
    const topo = topoRef.current
    const fundo = fundoRef.current
    if (!topo || !fundo || typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    /* ---------- Entradas ---------- */
    topo.classList.add('anima')
    let quadroEntrada = 0
    const mostrarCamadas = () => {
      quadroEntrada = requestAnimationFrame(() => topo.classList.add('carregado'))
    }
    if (fundo.complete && fundo.naturalWidth > 0) {
      void topo.offsetWidth // garante o estado inicial (opacidade 0) antes do fade
      mostrarCamadas()
    } else {
      fundo.addEventListener('load', mostrarCamadas, { once: true })
      fundo.addEventListener('error', mostrarCamadas, { once: true })
    }

    /* ---------- Escolha do modo ---------- */
    // 840 px: abaixo disso, 5% da largura é menos que os 42 px da frente e a borda apareceria.
    const consulta = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 840px)')
    let modo: 'mouse' | 'rolagem' | null = null
    let visivel = true

    /* ---------- Modo mouse ---------- */
    let alvoX = 0
    let alvoY = 0
    let atualX = 0
    let atualY = 0
    let quadro = 0

    const aoMoverMouse = (e: MouseEvent) => {
      // De -1 (borda esquerda/topo) a 1 (borda direita/base).
      alvoX = (e.clientX / window.innerWidth) * 2 - 1
      alvoY = (e.clientY / window.innerHeight) * 2 - 1
    }
    const aoSairDaJanela = () => {
      alvoX = 0
      alvoY = 0
    }
    const passoMouse = () => {
      // Cada quadro anda 8% do caminho que falta: é isso que dá o atraso suave.
      atualX += (alvoX - atualX) * 0.08
      atualY += (alvoY - atualY) * 0.08
      topo.style.setProperty('--mx', atualX.toFixed(4))
      topo.style.setProperty('--my', atualY.toFixed(4))
      quadro = requestAnimationFrame(passoMouse)
    }
    const ligarLaco = () => {
      if (quadro === 0) quadro = requestAnimationFrame(passoMouse)
    }
    const desligarLaco = () => {
      if (quadro !== 0) cancelAnimationFrame(quadro)
      quadro = 0
    }
    const entrarModoMouse = () => {
      window.addEventListener('mousemove', aoMoverMouse, { passive: true })
      document.documentElement.addEventListener('mouseleave', aoSairDaJanela)
      if (visivel) ligarLaco()
    }
    const sairModoMouse = () => {
      window.removeEventListener('mousemove', aoMoverMouse)
      document.documentElement.removeEventListener('mouseleave', aoSairDaJanela)
      desligarLaco()
      alvoX = alvoY = atualX = atualY = 0
      topo.style.removeProperty('--mx')
      topo.style.removeProperty('--my')
    }

    /* ---------- Modo rolagem ---------- */
    let quadroRolagem = 0
    const gravarProgresso = () => {
      quadroRolagem = 0
      const altura = topo.offsetHeight || 1
      const progresso = Math.min(1, Math.max(0, window.scrollY / altura))
      topo.style.setProperty('--p', progresso.toFixed(4))
    }
    const aoRolar = () => {
      if (quadroRolagem === 0) quadroRolagem = requestAnimationFrame(gravarProgresso)
    }
    const entrarModoRolagem = () => {
      window.addEventListener('scroll', aoRolar, { passive: true })
      aoRolar()
    }
    const sairModoRolagem = () => {
      window.removeEventListener('scroll', aoRolar)
      if (quadroRolagem !== 0) cancelAnimationFrame(quadroRolagem)
      quadroRolagem = 0
      topo.style.removeProperty('--p')
    }

    /* ---------- Troca de modo ---------- */
    const aplicarModo = () => {
      const novo = consulta.matches ? 'mouse' : 'rolagem'
      if (novo === modo) return
      if (modo === 'mouse') sairModoMouse()
      if (modo === 'rolagem') sairModoRolagem()
      modo = novo
      topo.classList.toggle('modo-mouse', modo === 'mouse')
      topo.classList.toggle('modo-rolagem', modo === 'rolagem')
      if (modo === 'mouse') entrarModoMouse()
      else entrarModoRolagem()
    }
    consulta.addEventListener('change', aplicarModo)

    // Pausa o laço do mouse quando o topo sai da tela (não gasta bateria à toa).
    const observador =
      'IntersectionObserver' in window
        ? new IntersectionObserver((entradas) => {
            visivel = entradas[entradas.length - 1].isIntersecting
            if (modo !== 'mouse') return
            if (visivel) ligarLaco()
            else desligarLaco()
          })
        : null
    observador?.observe(topo)

    aplicarModo()

    return () => {
      consulta.removeEventListener('change', aplicarModo)
      observador?.disconnect()
      sairModoMouse()
      sairModoRolagem()
      cancelAnimationFrame(quadroEntrada)
      fundo.removeEventListener('load', mostrarCamadas)
      fundo.removeEventListener('error', mostrarCamadas)
      topo.classList.remove('anima', 'carregado', 'modo-mouse', 'modo-rolagem')
    }
  }, [])

  return (
    <section id="hero" ref={topoRef} className="topo">
      <img
        ref={fundoRef}
        className="camada camada--fundo"
        src={HERO_CAMADAS.fundo}
        width={HERO_LARGURA}
        height={HERO_ALTURA}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
      />
      <img className="camada camada--meio" src={HERO_CAMADAS.meio} width={HERO_LARGURA} height={HERO_ALTURA} alt="" aria-hidden="true" decoding="async" />
      <img className="camada camada--frente" src={HERO_CAMADAS.frente} width={HERO_LARGURA} height={HERO_ALTURA} alt="" aria-hidden="true" decoding="async" />
      <div className="topo__veu" aria-hidden="true" />

      <div className="topo__texto">
        <h1 className="topo__titulo">
          Uma nova experiência para uma <span>antiga tradição.</span>
        </h1>
        <p className="topo__sub">
          Barbearia no Centro de Pato Branco. Corte, barba e barboterapia com toalha quente e massagem na cadeira.
        </p>
        <div className="topo__botoes">
          <Link to="/agendar" className="botao botao--principal">
            Agendar horário
          </Link>
          <Link to="/#servicos" className="botao botao--secundario">
            Ver serviços
          </Link>
        </div>
      </div>
    </section>
  )
}
