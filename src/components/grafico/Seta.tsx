interface Props {
  direcao?: 'direita' | 'esquerda' | 'baixo' | 'cima'
  /** Tamanho e cor (currentColor). */
  className?: string
}

const rotacao = {
  direita: 'rotate-0',
  baixo: 'rotate-90',
  esquerda: 'rotate-180',
  cima: '-rotate-90',
} as const

// Seta fina de traço único, como as dos posts. Decorativa.
export default function Seta({ direcao = 'direita', className = 'h-4 w-16 text-neon' }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      className={`${rotacao[direcao]} ${className}`}
    >
      <path d="M0 8H62M54 1L62 8L54 15" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
