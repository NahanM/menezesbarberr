import type { MouseEvent } from 'react'

// Primeiro item da tabulação em todas as rotas: invisível até receber foco, aí aparece no canto.
// Quem navega pelo teclado pula o cabeçalho (logo, âncoras, botão) e cai direto no conteúdo.
// Todo <main> do site tem id="conteudo" (o Lighthouse confere que o destino do link existe).
export default function PularParaConteudo() {
  const pular = (evento: MouseEvent<HTMLAnchorElement>) => {
    const principal = document.querySelector('main')
    if (!principal) return
    // Sem <main> ainda (página carregando), nada acontece. Com <main>, controlamos o foco:
    // tabindex -1 deixa o <main> receber foco por script (sem entrar na ordem do Tab).
    evento.preventDefault()
    if (!principal.hasAttribute('tabindex')) principal.setAttribute('tabindex', '-1')
    // preventScroll + scrollIntoView: o foco não faz a rolagem sozinho, e o scroll-margin-top do <main>
    // (styles/index.css) mantém o topo dele abaixo do cabeçalho fixo.
    principal.focus({ preventScroll: true })
    principal.scrollIntoView({ block: 'start' })
  }

  return (
    <a
      href="#conteudo"
      onClick={pular}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-gutter focus:z-[100] focus:bg-neon focus:px-5 focus:py-3 focus:font-display focus:text-2xl focus:tracking-wider focus:text-preto focus:uppercase"
    >
      Pular para o conteúdo
    </a>
  )
}
