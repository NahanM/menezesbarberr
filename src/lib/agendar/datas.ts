// Datas do agendamento. Regra do projeto: todo cálculo de dia e toda exibição
// usam o fuso America/Sao_Paulo, não o do celular de quem acessa.
//
// Dois formatos circulam aqui:
//   - "dia" (DiaISO): texto "AAAA-MM-DD", um dia do calendário de São Paulo.
//   - "instante": texto ISO com fuso (timestamptz do banco) ou Date.

import { horarioFuncionamento, janelaMaximaDias } from '../../data/barbearia.ts'

export const FUSO = 'America/Sao_Paulo'

/** Texto "AAAA-MM-DD". */
export type DiaISO = string

export interface DiaSelecionavel {
  iso: DiaISO
  /** 0 = domingo ... 6 = sábado. */
  diaSemana: number
  /** true se a barbearia não abre nesse dia (aparece apagado no calendário). */
  fechado: boolean
}

/** Converte a data para São Paulo e devolve uma função que pega cada pedaço (ano, mês, hora...). */
function partesEmSP(instante: Date, opcoes: Intl.DateTimeFormatOptions) {
  const partes = new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: FUSO }).formatToParts(
    instante,
  )
  return (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? ''
}

/** Aceita Date, timestamptz em texto ou dia "AAAA-MM-DD" e devolve um Date. */
function paraDate(valor: string | Date): Date {
  if (valor instanceof Date) return valor
  // "2026-10-09" sem hora é lido como meia-noite UTC, que em SP ainda é o dia anterior.
  // Usar o meio-dia UTC (09h em SP) mantém o mesmo dia do calendário.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return new Date(`${valor}T12:00:00Z`)
  return new Date(valor)
}

/** O dia de hoje no calendário de São Paulo. `agora` existe para os testes. */
export function hojeEmSP(agora: Date = new Date()): DiaISO {
  const parte = partesEmSP(agora, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

/** Soma (ou subtrai) dias a um dia do calendário. Usa UTC só para a conta não sofrer com fuso. */
export function somarDias(dia: DiaISO, quantidade: number): DiaISO {
  const [ano, mes, dd] = dia.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dd + quantidade))
  return data.toISOString().slice(0, 10)
}

/** Dia da semana de um dia do calendário: 0 = domingo ... 6 = sábado. */
export function diaDaSemana(dia: DiaISO): number {
  const [ano, mes, dd] = dia.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dd)).getUTCDay()
}

/** A barbearia abre nesse dia da semana? (lê horarioFuncionamento de barbearia.ts) */
export function barbeariaAbre(diaSemana: number): boolean {
  const faixa = horarioFuncionamento.find((f) => f.dias.includes(diaSemana))
  return faixa !== undefined && faixa.abre !== null
}

/**
 * Lista de hoje até hoje + janela, em ordem. Dias fechados vêm marcados
 * (`fechado: true`) para o calendário mostrá-los apagados.
 */
export function diasSelecionaveis(
  agora: Date = new Date(),
  janela: number = janelaMaximaDias,
): DiaSelecionavel[] {
  const hoje = hojeEmSP(agora)
  const dias: DiaSelecionavel[] = []
  for (let i = 0; i <= janela; i++) {
    const iso = somarDias(hoje, i)
    const diaSemana = diaDaSemana(iso)
    dias.push({ iso, diaSemana, fechado: !barbeariaAbre(diaSemana) })
  }
  return dias
}

/** "quarta", "sábado"... (sem o "-feira"). Aceita instante ou dia "AAAA-MM-DD". */
export function formatarDiaSemana(valor: string | Date): string {
  const nome = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: FUSO }).format(
    paraDate(valor),
  )
  return nome.replace(/-feira$/, '')
}

/** "09/10". */
export function formatarDDMM(valor: string | Date): string {
  const parte = partesEmSP(paraDate(valor), { day: '2-digit', month: '2-digit' })
  return `${parte('day')}/${parte('month')}`
}

/** "14:30" (24 horas, em São Paulo). */
export function formatarHHMM(valor: string | Date): string {
  // hourCycle h23 evita "24:00" à meia-noite em alguns navegadores.
  const parte = partesEmSP(paraDate(valor), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `${parte('hour')}:${parte('minute')}`
}
