import { type DiaISO } from '../../lib/agendar/datas.ts'
import { somarDiasValidos } from '../../lib/painel/agenda.ts'
import { inicioDaSemana, rotuloSemana } from '../../lib/painel/semana.ts'
import Seta from '../grafico/Seta.tsx'
import { classeBotaoAtual, classeBotaoNavegacao } from './estilosNavegacao.ts'

interface Props {
  /** Qualquer dia da semana mostrada. */
  dia: DiaISO
  hoje: DiaISO
  /** Recebe um dia da semana escolhida (a visão só guarda um dia na URL). */
  aoIrPara: (dia: DiaISO) => void
}

// Rótulo da semana ("06/10 – 12/10") em escala grande e os botões semana anterior, esta semana, próxima.
export default function NavegacaoSemana({ dia, hoje, aoIrPara }: Props) {
  const ehEsta = inicioDaSemana(dia) === inicioDaSemana(hoje)
  const anterior = somarDiasValidos(dia, -7)
  const proxima = somarDiasValidos(dia, 7)
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-cimento pb-6">
      <div>
        <h1 className="font-corpo text-sm leading-normal font-normal tracking-widest text-neon uppercase">
          Agenda da semana
        </h1>
        <p aria-live="polite" className="mt-1 flex flex-wrap items-baseline gap-x-4 font-display text-display-md leading-[0.9] text-branco uppercase">
          <span>{rotuloSemana(dia)}</span>
          {ehEsta && <span className="font-corpo text-sm tracking-widest text-neon">Esta semana</span>}
        </p>
      </div>
      <nav aria-label="Navegar entre as semanas" className="flex gap-2">
        <button
          type="button"
          aria-label="Semana anterior"
          disabled={anterior === null}
          onClick={() => anterior && aoIrPara(anterior)}
          className={classeBotaoNavegacao}
        >
          <Seta direcao="esquerda" className="h-3 w-8" />
        </button>
        <button
          type="button"
          onClick={() => aoIrPara(hoje)}
          aria-current={ehEsta ? 'date' : undefined}
          className={ehEsta ? classeBotaoAtual : classeBotaoNavegacao}
        >
          Esta semana
        </button>
        <button
          type="button"
          aria-label="Próxima semana"
          disabled={proxima === null}
          onClick={() => proxima && aoIrPara(proxima)}
          className={classeBotaoNavegacao}
        >
          <Seta direcao="direita" className="h-3 w-8" />
        </button>
      </nav>
    </div>
  )
}
