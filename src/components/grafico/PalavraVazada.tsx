interface Props {
  texto: string
  /** Texto de baixo para cima, como "BOLDMIND" no post. */
  vertical?: boolean
  /** Tamanho e cor do contorno (a cor vem de currentColor). */
  className?: string
}

// Palavra só com contorno, em fonte display. Decorativa: o texto real fica em outro elemento.
export default function PalavraVazada({
  texto,
  vertical = false,
  className = 'text-display-lg text-cimento',
}: Props) {
  const orientacao = vertical ? '[writing-mode:vertical-rl] rotate-180' : ''
  return (
    <span
      aria-hidden="true"
      className={`texto-vazado block font-display leading-none whitespace-nowrap uppercase select-none ${orientacao} ${className}`}
    >
      {texto}
    </span>
  )
}
