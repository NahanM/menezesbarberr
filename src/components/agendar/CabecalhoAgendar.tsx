import { Link } from 'react-router'
import Logo from '../Logo.tsx'
import { TOTAL_PASSOS } from '../../lib/agendar/estado.ts'

interface Props {
  passo: number
}

// Cabeçalho do /agendar: logo (volta à landing) e, colada na borda de baixo, a barra de progresso.
// A barra é uma faixa neon que cresce com scaleX (só transform): passo 3 de 5 = 60% da largura.
export default function CabecalhoAgendar({ passo }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 bg-preto">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-gutter">
        <Link to="/" aria-label="Menezes Barber’s, voltar ao site" className="block">
          <Logo className="h-10" />
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-corpo text-sm tracking-widest text-cinza-claro uppercase transition-colors duration-rapida hover:text-branco"
        >
          Sair do agendamento
        </Link>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso do agendamento"
        aria-valuemin={1}
        aria-valuemax={TOTAL_PASSOS}
        aria-valuenow={passo}
        aria-valuetext={`Passo ${passo} de ${TOTAL_PASSOS}`}
        className="absolute inset-x-0 bottom-0 h-0.5 bg-cimento"
      >
        <div
          className="h-full origin-left bg-neon transition-transform duration-media ease-urbz motion-reduce:transition-none"
          style={{ transform: `scaleX(${passo / TOTAL_PASSOS})` }}
        />
      </div>
    </header>
  )
}
