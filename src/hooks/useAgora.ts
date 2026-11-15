import { useEffect, useState } from 'react'

/**
 * O instante atual (ms), atualizado a cada `intervaloMs`. Serve para a linha "agora" da agenda
 * e para o "hoje" virar sozinho à meia-noite com a aba aberta.
 */
export function useAgora(intervaloMs = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs])
  return agora
}
