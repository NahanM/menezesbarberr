import { type Ref } from 'react'
import { type DiaISO } from '../../lib/agendar/datas.ts'
import { rotuloDia, somarDiasValidos } from '../../lib/painel/agenda.ts'
import Seta from '../grafico/Seta.tsx'
import { classeBotaoAtual, classeBotaoNavegacao } from './estilosNavegacao.ts'

interface Props {
  dia: DiaISO
  hoje: DiaISO
  aoIrPara: (dia: DiaISO) => void
  /** Para a visão levar o foco ao título quando é aberta pelo link da semana. */
  tituloRef?: Ref<HTMLHeadingElement>
}

// Título do dia em escala grande e os três botões de navegação: anterior, hoje, próximo.
// Nas pontas do calendário que a URL aceita (lerDia), anterior/próximo ficam desabilitados.
export default function NavegacaoDia({ dia, hoje, aoIrPara, tituloRef }: Props) {
  const ehHoje = dia === hoje
  const anterior = somarDiasValidos(dia, -1)
  const proximo = somarDiasValidos(dia, 1)
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-cimento pb-6">
      <div>
        {/* tabIndex -1: o foco pode ser posto aqui por código (não entra na ordem do Tab) */}
        <h1 ref={tituloRef} tabIndex={-1} className="font-corpo text-sm leading-normal font-normal tracking-widest text-neon uppercase focus:outline-none">
          Agenda do dia
        </h1>
        {/* aria-live: ao trocar de dia, o leitor de tela anuncia a nova data */}
        <p aria-live="polite" className="mt-1 flex flex-wrap items-baseline gap-x-4 font-display text-display-md leading-[0.9] text-branco uppercase">
          <span>{rotuloDia(dia)}</span>
          {ehHoje && <span className="font-corpo text-sm tracking-widest text-neon">Hoje</span>}
        </p>
      </div>
      <nav aria-label="Navegar entre os dias" className="flex gap-2">
        <button
          type="button"
          aria-label="Dia anterior"
          disabled={anterior === null}
          onClick={() => anterior && aoIrPara(anterior)}
          className={classeBotaoNavegacao}
        >
          <Seta direcao="esquerda" className="h-3 w-8" />
        </button>
        <button
          type="button"
          onClick={() => aoIrPara(hoje)}
          aria-current={ehHoje ? 'date' : undefined}
          className={ehHoje ? classeBotaoAtual : classeBotaoNavegacao}
        >
          Hoje
        </button>
        <button
          type="button"
          aria-label="Próximo dia"
          disabled={proximo === null}
          onClick={() => proximo && aoIrPara(proximo)}
          className={classeBotaoNavegacao}
        >
          <Seta direcao="direita" className="h-3 w-8" />
        </button>
      </nav>
    </div>
  )
}
