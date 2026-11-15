import { useSpring, type MotionValue } from 'motion/react'
import { MOLA_AMORTECIMENTO, MOLA_RIGIDEZ } from '../config/scroll.ts'

/**
 * Passa o progresso da rolagem por uma mola: a animação segue a rolagem com peso, sem tranco.
 * A mola só atrasa a animação; ela nunca segura nem ignora a rolagem da pessoa.
 * restDelta pequeno: o progresso vai de 0 a 1 em milhares de px, então o padrão (0,01) pararia ~20px antes.
 */
export function useProgressoSuave(progresso: MotionValue<number>): MotionValue<number> {
  return useSpring(progresso, {
    stiffness: MOLA_RIGIDEZ,
    damping: MOLA_AMORTECIMENTO,
    restDelta: 0.0001,
    restSpeed: 0.0005,
  })
}
