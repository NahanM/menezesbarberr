import { useSyncExternalStore } from 'react'
import { CONSULTA_DESKTOP } from '../config/scroll.ts'

export type ModoRolagem = 'desktop' | 'celular'

function assinar(aviso: () => void) {
  const m = window.matchMedia(CONSULTA_DESKTOP)
  m.addEventListener('change', aviso)
  return () => m.removeEventListener('change', aviso)
}

/** 'desktop' (mouse e tela larga, com Lenis) ou 'celular' (rolagem nativa). Muda se a janela mudar. */
export function useModoRolagem(): ModoRolagem {
  return useSyncExternalStore(
    assinar,
    () => (window.matchMedia(CONSULTA_DESKTOP).matches ? 'desktop' : 'celular'),
    () => 'celular',
  )
}
