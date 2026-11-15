import { useSyncExternalStore } from 'react'

/**
 * true enquanto a media query casa; acompanha a janela ao redimensionar.
 * Sem janela (render fora do navegador) devolve false.
 */
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (aviso) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', aviso)
      return () => m.removeEventListener('change', aviso)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
