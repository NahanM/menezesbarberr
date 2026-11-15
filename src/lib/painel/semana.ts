// Lógica pura da visão da semana do painel. A semana vai de segunda a domingo, em São Paulo.

import {
  barbeariaAbre,
  diaDaSemana,
  formatarDDMM,
  hojeEmSP,
  somarDias,
  type DiaISO,
} from '../agendar/datas.ts'
import {
  agruparPorBarbeiro,
  contarAtendimentos,
  ehDiaValido,
  contaComoAgendado,
  minutoNoDia,
  type Agendamento,
  type BarbeiroAtivo,
  type Bloqueio,
  type ContagemAtendimentos,
} from './agenda.ts'

/** Segunda-feira da semana que contém `dia`. */
export function inicioDaSemana(dia: DiaISO): DiaISO {
  // diaDaSemana: 0 = domingo. Segunda = 1, então domingo volta 6 dias e os outros (dia - 1).
  const voltar = (diaDaSemana(dia) + 6) % 7
  return somarDias(dia, -voltar)
}

/** Os 7 dias da semana de `dia`, de segunda a domingo. Dia fora do que o painel aceita (pontas do calendário) é omitido. */
export function diasDaSemana(dia: DiaISO): DiaISO[] {
  const segunda = inicioDaSemana(dia)
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)).filter(ehDiaValido)
}

/** Primeiro e último dia (válidos) da semana, para pedir ao servidor numa chamada só. */
export function periodoDaSemana(dia: DiaISO): { de: DiaISO; ate: DiaISO } {
  const dias = diasDaSemana(dia)
  return { de: dias[0] ?? dia, ate: dias[dias.length - 1] ?? dia }
}

/** "06/10 – 12/10". */
export function rotuloSemana(dia: DiaISO): string {
  const { de, ate } = periodoDaSemana(dia)
  return `${formatarDDMM(de)} – ${formatarDDMM(ate)}`
}

export interface ResumoBarbeiro {
  barbeiroId: string
  nome: string
  /** Atendimentos ativos (cancelado não conta). */
  quantidade: number
}

export interface ResumoDia {
  dia: DiaISO
  /** A barbearia não abre nesse dia da semana (horarioFuncionamento). */
  fechado: boolean
  /** Agendados: tudo menos cancelado e não compareceu (mesma regra do resumo do topo). */
  total: number
  /** Pendentes: pedem ação da equipe. */
  pendentes: number
  confirmados: number
  /** Só quem tem atendimento no dia, na ordem dos barbeiros. */
  porBarbeiro: ResumoBarbeiro[]
  /** Bloqueios que tocam o dia (inclusive os de vários dias e os da barbearia inteira). */
  bloqueios: Bloqueio[]
}

/** O dia do calendário de São Paulo em que o instante cai. */
function diaEmSP(instante: string): DiaISO {
  return hojeEmSP(new Date(instante))
}

/** O bloqueio ocupa algum minuto desse dia? (recorta bloqueios que começam antes ou terminam depois) */
function bloqueioToca(k: Bloqueio, dia: DiaISO): boolean {
  return minutoNoDia(k.inicio, dia) < minutoNoDia(k.fim, dia)
}

/**
 * Um resumo por dia: agrupa o que veio numa chamada só. O agendamento pertence ao dia em que
 * COMEÇA (em São Paulo), então um atendimento às 23:30 não vira o dia seguinte por causa do UTC.
 */
export function resumirSemana(
  dias: readonly DiaISO[],
  barbeiros: readonly BarbeiroAtivo[],
  agendamentos: readonly Agendamento[],
  bloqueios: readonly Bloqueio[],
): ResumoDia[] {
  const porDia = new Map<DiaISO, Agendamento[]>(dias.map((d) => [d, []]))
  for (const a of agendamentos) {
    if (contaComoAgendado(a.status)) porDia.get(diaEmSP(a.inicio))?.push(a)
  }

  return dias.map((dia) => {
    const doDia = porDia.get(dia) ?? []
    const porBarbeiro = agruparPorBarbeiro(barbeiros, doDia, [])
      .map((c) => ({ barbeiroId: c.barbeiroId, nome: c.nome, quantidade: c.agendamentos.length }))
      .filter((b) => b.quantidade > 0)
    const { agendados, pendentes, confirmados } = contarAtendimentos(doDia)
    return {
      dia,
      fechado: !barbeariaAbre(diaDaSemana(dia)),
      total: agendados,
      pendentes,
      confirmados,
      porBarbeiro,
      bloqueios: bloqueios.filter((k) => bloqueioToca(k, dia)),
    }
  })
}

/** Resumo da semana inteira: soma dos dias, mais o primeiro dia que tem pendente (atalho do resumo). */
export function resumirPeriodo(dias: readonly ResumoDia[]): Omit<ContagemAtendimentos, 'primeiroPendenteId'> & {
  primeiroDiaComPendente: DiaISO | null
} {
  return {
    agendados: dias.reduce((soma, d) => soma + d.total, 0),
    pendentes: dias.reduce((soma, d) => soma + d.pendentes, 0),
    confirmados: dias.reduce((soma, d) => soma + d.confirmados, 0),
    // `dias` vem em ordem de calendário (segunda a domingo), então o primeiro que acha é o mais cedo.
    primeiroDiaComPendente: dias.find((d) => d.pendentes > 0)?.dia ?? null,
  }
}
