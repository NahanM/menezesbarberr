interface Props {
  /** Tamanho e cor da faixa. A cor vem de currentColor (padrão: neon). */
  className?: string
}

// Faixa de listras "////" dos posts. Decorativa: some para leitor de tela.
export default function Listras({ className = 'h-6 w-full text-neon' }: Props) {
  return <div aria-hidden="true" className={`listras ${className}`} />
}
