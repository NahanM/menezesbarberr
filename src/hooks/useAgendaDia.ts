import { useMemo } from 'react'
import type { DiaISO } from '../lib/agendar/datas.ts'
import {
  agruparPorBarbeiro,
  calcularGrade,
  type BarbeiroAtivo,
  type ColunaBarbeiro,
  type Grade,
} from '../lib/painel/agenda.ts'
import { useDadosDoPeriodo, type ComandosDoPeriodo } from './useDadosDoPeriodo.ts'

export type EstadoAgendaDia =
  | { status: 'carregando' }
  | { status: 'erro' }
  | {
      status: 'ok'
      colunas: ColunaBarbeiro[]
      /** Barbeiros ativos (a lista do formulário de bloqueio; as colunas podem ter também desativados com agendamento). */
      barbeiros: BarbeiroAtivo[]
      grade: Grade
      /** Nenhum agendamento e nenhum bloqueio no dia (as colunas dos barbeiros continuam existindo). */
      vazio: boolean
    }

/**
 * Agenda de um dia: busca (com descarte de resposta fora de ordem e atualização silenciosa, ver
 * useDadosDoPeriodo) e organiza em colunas por barbeiro e grade de horas.
 */
export function useAgendaDia(
  dia: DiaISO,
  /** Filtro "Mostrar cancelados" ligado: a faixa de horas também considera os cancelados. */
  incluirCancelados = false,
): EstadoAgendaDia & ComandosDoPeriodo & { tentarDeNovo: () => void } {
  const periodo = useDadosDoPeriodo(dia, dia)
  const dados = periodo.status === 'ok' ? periodo.dados : null

  const pronto = useMemo(() => {
    if (dados === null) return null
    return {
      colunas: agruparPorBarbeiro(dados.barbeiros, dados.agendamentos, dados.bloqueios),
      barbeiros: dados.barbeiros,
      grade: calcularGrade(dia, dados.agendamentos, undefined, incluirCancelados),
      vazio: dados.agendamentos.length === 0 && dados.bloqueios.length === 0,
    }
  }, [dados, dia, incluirCancelados])

  const { tentarDeNovo, atualizar, aplicar, aplicarBloqueios } = periodo
  const acoes = { tentarDeNovo, atualizar, aplicar, aplicarBloqueios }
  if (pronto === null) return { status: periodo.status === 'erro' ? 'erro' : 'carregando', ...acoes }
  return { status: 'ok', ...pronto, ...acoes }
}
