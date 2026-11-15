export type Visao = 'dia' | 'semana'

interface Props {
  visao: Visao
  aoMudar: (visao: Visao) => void
}

const OPCOES: { valor: Visao; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Dia' },
  { valor: 'semana', rotulo: 'Semana' },
]

// Dois botões com aria-pressed (o escolhido fica cheio em branco). Controle segmentado, cantos retos.
export default function SeletorVisao({ visao, aoMudar }: Props) {
  return (
    <div role="group" aria-label="Visão da agenda" className="flex w-full sm:w-auto sm:justify-end">
      {OPCOES.map(({ valor, rotulo }) => {
        const ativo = valor === visao
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar(valor)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center border-2 px-6 font-display text-lg tracking-wider uppercase transition-colors duration-rapida ease-urbz sm:flex-none ${
              ativo
                ? 'border-branco bg-branco text-preto'
                : 'border-cimento text-branco hover:border-neon hover:text-neon'
            } ${valor === 'semana' ? 'border-l-0' : ''}`}
          >
            {rotulo}
          </button>
        )
      })}
    </div>
  )
}
