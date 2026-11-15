import { useReducedMotion } from 'motion/react'

// Motion devolve boolean | null (null antes de medir). Aqui tratamos null como "não pediu".
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false
}
