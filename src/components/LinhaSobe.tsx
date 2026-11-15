import { useRef, type ReactNode } from 'react'
import { useRevelarAoEntrar } from '../hooks/useRevelarAoEntrar.ts'

interface Props {
  children: ReactNode
  /** Tamanho da fonte (token text-display-*) e cor. */
  className?: string
  /** Espera antes de subir, em ms. Escalone as linhas de um título. */
  atrasoMs?: number
  /** De onde o texto vem: de baixo (padrão), da esquerda ou da direita. */
  de?: 'baixo' | 'esquerda' | 'direita'
}

// A linha sobe de baixo da máscara (ou entra pelo lado) (só transform). Função fora do componente: referência estável.
function subir(): Keyframe[] {
  return [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }]
}
function entrarPelaEsquerda(): Keyframe[] {
  return [{ transform: 'translateX(-105%)' }, { transform: 'translateX(0)' }]
}
function entrarPelaDireita(): Keyframe[] {
  return [{ transform: 'translateX(105%)' }, { transform: 'translateX(0)' }]
}
const entradas = { baixo: subir, esquerda: entrarPelaEsquerda, direita: entrarPelaDireita } as const

// Uma linha de título que "sobe por máscara". A caixa de fora corta (overflow-hidden) e
// fica parada; o texto de dentro sobe. O padding extra com margem negativa dá folga para
// til, cedilha e a cauda do Q não serem cortados pelo line-height apertado.
// Sem JS ou com reduced-motion o texto já está no lugar (ver useRevelarAoEntrar).
export default function LinhaSobe({ children, className = '', atrasoMs = 0, de = 'baixo' }: Props) {
  const mascara = useRef<HTMLSpanElement>(null)
  const texto = useRef<HTMLSpanElement>(null)
  useRevelarAoEntrar(texto, mascara, entradas[de], atrasoMs)

  return (
    <span
      ref={mascara}
      className={`-my-[0.1em] block overflow-hidden py-[0.1em] ${className}`}
    >
      <span ref={texto} className="block">
        {children}
      </span>
    </span>
  )
}
