// Lógica pura do formulário "Bloquear horário": validação, montagem do período e textos.
// Sem React e sem rede. O servidor (criar_bloqueio) é quem valida de verdade; aqui é conforto visual.
// Regra do projeto: dia e hora são sempre os de São Paulo, não os do aparelho de quem usa.

import { horarioFuncionamento } from '../../data/barbearia.ts'
import { FUSO, diaDaSemana, hojeEmSP, type DiaISO } from '../agendar/datas.ts'
import { ehDiaValido, formatarFaixaHora, rotuloDia } from './agenda.ts'

/** Mesmo limite do servidor (criar_bloqueio, URB13): 120 caracteres depois de limpar os espaços. */
export const MOTIVO_MAX = 120

/** Atalhos de motivo mostrados como botões acima do texto livre. */
export const MOTIVOS_RAPIDOS = ['Folga', 'Compromisso', 'Almoço estendido'] as const

/** Valor do campo "barbeiro" quando o bloqueio vale para a barbearia inteira (no banco: barbeiro nulo). */
export const BARBEARIA_TODA = 'todos'

export interface FormBloqueio {
  /** '' = ainda não escolheu; BARBEARIA_TODA; ou o id de um barbeiro. */
  barbeiro: string
  dia: DiaISO
  /** "HH:MM", como o <input type="time"> entrega. */
  inicio: string
  fim: string
  motivo: string
}

export type CampoBloqueio = keyof FormBloqueio
export type ErrosBloqueio = Partial<Record<CampoBloqueio, string>>

/** O que vai para a função criar_bloqueio. */
export interface PedidoBloqueio {
  barbeiroId: string | null
  /** timestamptz em ISO (UTC). */
  inicio: string
  fim: string
  motivo: string
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Motivo como o servidor o guarda: espaços e quebras repetidos viram um espaço, sem sobras nas pontas. */
export function limparMotivo(motivo: string): string {
  return motivo.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------
// Dia + hora de São Paulo -> instante (timestamptz)
// ---------------------------------------------------------------

/** Quanto a hora de parede de SP está à frente do UTC naquele instante, em ms (negativo: -3h). */
function deslocamentoSP(instante: number): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante))
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value)
  const parede = Date.UTC(valor('year'), valor('month') - 1, valor('day'), valor('hour'), valor('minute'), valor('second'))
  return parede - Math.floor(instante / 1000) * 1000
}

/**
 * "2026-10-15" + "09:30" (hora de parede em São Paulo) -> instante em ISO/UTC ("2026-10-15T12:30:00.000Z").
 * Pergunta o deslocamento ao próprio Intl em vez de fixar -03:00: o resultado continua certo se o Brasil
 * voltar ao horário de verão (ou para datas antigas, em que ele existia).
 */
export function instanteEmSP(dia: DiaISO, hhmm: string): string {
  const [ano, mes, dd] = dia.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const parede = Date.UTC(ano, mes - 1, dd, hh, mm)
  const chute = parede - deslocamentoSP(parede)
  return new Date(parede - deslocamentoSP(chute)).toISOString()
}

/** Início e fim do bloqueio em instantes. Supõe campos já validados. */
export function periodoDoBloqueio(dia: DiaISO, inicio: string, fim: string): { inicio: string; fim: string } {
  return { inicio: instanteEmSP(dia, inicio), fim: instanteEmSP(dia, fim) }
}

/** Monta o que a função do banco recebe. Supõe formulário já validado. */
export function montarPedido(form: FormBloqueio): PedidoBloqueio {
  return {
    barbeiroId: form.barbeiro === BARBEARIA_TODA ? null : form.barbeiro,
    ...periodoDoBloqueio(form.dia, form.inicio, form.fim),
    motivo: limparMotivo(form.motivo),
  }
}

// ---------------------------------------------------------------
// "Dia inteiro"
// ---------------------------------------------------------------

/** Da abertura ao fechamento do dia; em dia fechado, o dia todo (00:00 às 23:59). */
export function janelaDoDia(dia: DiaISO): { inicio: string; fim: string } {
  const faixa = horarioFuncionamento.find((f) => f.dias.includes(diaDaSemana(dia)))
  if (faixa?.abre && faixa.fecha) return { inicio: faixa.abre, fim: faixa.fecha }
  return { inicio: '00:00', fim: '23:59' }
}

// ---------------------------------------------------------------
// Validação (só conforto: o servidor repete tudo)
// ---------------------------------------------------------------

/** Erros por campo, em português. Objeto vazio = pode enviar. `agora` (ms) existe para os testes. */
export function validarBloqueio(form: FormBloqueio, agora: number = Date.now()): ErrosBloqueio {
  const erros: ErrosBloqueio = {}

  if (form.barbeiro === '') erros.barbeiro = 'Escolha o barbeiro ou "Barbearia toda".'

  if (form.dia === '') erros.dia = 'Escolha o dia.'
  else if (!ehDiaValido(form.dia)) erros.dia = 'Esse dia não existe. Escolha outro.'

  if (form.inicio === '') erros.inicio = 'Informe a hora de início.'
  else if (!HORA.test(form.inicio)) erros.inicio = 'Hora de início inválida.'

  if (form.fim === '') erros.fim = 'Informe a hora de fim.'
  else if (!HORA.test(form.fim)) erros.fim = 'Hora de fim inválida.'
  else if (erros.inicio === undefined && form.fim <= form.inicio) erros.fim = 'O fim precisa ser depois do início.'
  else if (erros.dia === undefined && Date.parse(instanteEmSP(form.dia, form.fim)) <= agora) {
    erros.fim = 'Esse horário já passou. Escolha um fim no futuro.'
  }

  if (limparMotivo(form.motivo).length > MOTIVO_MAX) erros.motivo = `O motivo pode ter até ${MOTIVO_MAX} caracteres.`

  return erros
}

/** Ordem dos campos na tela: o primeiro com erro recebe o foco. */
export const ORDEM_DOS_CAMPOS: readonly CampoBloqueio[] = ['barbeiro', 'dia', 'inicio', 'fim', 'motivo']

// ---------------------------------------------------------------
// Textos
// ---------------------------------------------------------------

/** "Rafael" ou "Barbearia toda". */
export function rotuloDeQuem(barbeiroNome: string | null): string {
  return barbeiroNome ?? 'Barbearia toda'
}

/**
 * Frase de confirmação (aria-live) depois de criar. O servidor NÃO recusa bloqueio sobre agendamento:
 * cria e devolve quantos já estavam marcados. Eles seguem na agenda, e quem atende precisa saber.
 */
export function avisoBloqueioCriado(args: {
  barbeiroNome: string | null
  inicio: string
  fim: string
  conflitos: number
}): string {
  const dia = rotuloDia(hojeEmSP(new Date(args.inicio)))
  const base = `Bloqueio criado: ${rotuloDeQuem(args.barbeiroNome)}, ${dia}, ${formatarFaixaHora(args.inicio, args.fim)}.`
  if (args.conflitos <= 0) return base
  const um = args.conflitos === 1
  const marcados = um ? '1 agendamento já estava marcado' : `${args.conflitos} agendamentos já estavam marcados`
  return `${base} Atenção: ${marcados} nesse período e ${um ? 'continua' : 'continuam'} na agenda. Avise ${um ? 'o cliente' : 'os clientes'} ou cancele.`
}
