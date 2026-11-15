import { useMemo } from 'react'
import type { DiaISO } from '../lib/agendar/datas.ts'
import { diasDaSemana, periodoDaSemana, resumirSemana, type ResumoDia } from '../lib/painel/semana.ts'
import { useDadosDoPeriodo } from './useDadosDoPeriodo.ts'

export type EstadoAgendaSemana =
  | { status: 'carregando' }
  | { status: 'erro' }
  | {
      status: 'ok'
      dias: ResumoDia[]
      /** Nenhum agendamento e nenhum bloqueio na semana inteira. */
      vazio: boolean
    }

/**
 * Agenda da semana (segunda a domingo) que contém `dia`: UMA chamada para os 7 dias, depois
 * agrupada por dia. Mesmo comportamento do dia: descarta resposta fora de ordem e atualiza em silêncio.
 */
export function useAgendaSemana(dia: DiaISO): EstadoAgendaSemana & { tentarDeNovo: () => void } {
  const { de, ate } = periodoDaSemana(dia)
  const periodo = useDadosDoPeriodo(de, ate)
  const dados = periodo.status === 'ok' ? periodo.dados : null

  const pronto = useMemo(() => {
    if (dados === null) return null
    return {
      dias: resumirSemana(diasDaSemana(dia), dados.barbeiros, dados.agendamentos, dados.bloqueios),
      vazio: dados.agendamentos.length === 0 && dados.bloqueios.length === 0,
    }
  }, [dados, dia])

  if (pronto === null) {
    return periodo.status === 'erro'
      ? { status: 'erro', tentarDeNovo: periodo.tentarDeNovo }
      : { status: 'carregando', tentarDeNovo: periodo.tentarDeNovo }
  }
  return { status: 'ok', ...pronto, tentarDeNovo: periodo.tentarDeNovo }
}
