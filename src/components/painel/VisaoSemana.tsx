import { useAgendaSemana } from '../../hooks/useAgendaSemana.ts'
import type { DiaISO } from '../../lib/agendar/datas.ts'
import { resumirPeriodo } from '../../lib/painel/semana.ts'
import { CarregandoAgenda, ErroAgenda } from './AvisosAgenda.tsx'
import CartaoDiaSemana from './CartaoDiaSemana.tsx'
import NavegacaoSemana from './NavegacaoSemana.tsx'
import ResumoPeriodo from './ResumoPeriodo.tsx'

interface Props {
  /** Qualquer dia da semana mostrada. */
  dia: DiaISO
  hoje: DiaISO
  aoIrPara: (dia: DiaISO) => void
}

// Visão "Semana": os 7 dias (segunda a domingo) com total, pendentes e resumo por barbeiro.
// Celular: lista vertical. A partir de lg: 7 colunas lado a lado.
export default function VisaoSemana({ dia, hoje, aoIrPara }: Props) {
  const semana = useAgendaSemana(dia)
  // Soma dos dias que o cartão de cada dia já mostra (mesma conta, resumirPeriodo). null enquanto carrega.
  const totais = semana.status === 'ok' ? resumirPeriodo(semana.dias) : null

  return (
    <div>
      <NavegacaoSemana dia={dia} hoje={hoje} aoIrPara={aoIrPara} />

      {semana.status !== 'erro' && (
        <ResumoPeriodo
          rotulo="Resumo da semana"
          numeros={totais}
          atalho={totais?.primeiroDiaComPendente ? { tipo: 'link', dia: totais.primeiroDiaComPendente } : undefined}
        />
      )}

      <div className="mt-6">
        {semana.status === 'carregando' && <CarregandoAgenda />}
        {semana.status === 'erro' && <ErroAgenda aoTentarDeNovo={semana.tentarDeNovo} />}

        {semana.status === 'ok' && (
          <>
            {semana.vazio && (
              <p role="status" className="mb-6 border-l-4 border-neon bg-concreto px-4 py-3 text-branco">
                Nenhum agendamento nesta semana.
              </p>
            )}
            <ul
              aria-label="Dias da semana"
              className="grid grid-cols-1 divide-y divide-cimento border-y border-cimento lg:grid-cols-7 lg:divide-x lg:divide-y-0"
            >
              {semana.dias.map((resumo) => (
                <li key={resumo.dia} className="min-w-0">
                  <CartaoDiaSemana resumo={resumo} ehHoje={resumo.dia === hoje} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
