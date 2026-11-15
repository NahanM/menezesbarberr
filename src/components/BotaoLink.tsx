import { Link } from 'react-router'
import type { ReactNode } from 'react'

interface Props {
  to: string
  children: ReactNode
  className?: string
  /** Nome acessível quando o texto visível é curto demais (ex.: "Agendar" vira "Agendar Essencial"). */
  ariaLabel?: string
}

// Botão de ação principal: neon, canto reto, fonte display. É um <a> (Link), porque leva a outra rota.
export default function BotaoLink({ to, children, className = '', ariaLabel }: Props) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={`inline-flex min-h-11 items-center justify-center bg-neon px-5 font-display text-xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco ${className}`}
    >
      {children}
    </Link>
  )
}
