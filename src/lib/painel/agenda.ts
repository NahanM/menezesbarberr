// Lógica pura da agenda do painel: sem React e sem rede, por isso é fácil de testar.
// Regra do projeto: todo cálculo de dia e toda hora exibida usam America/Sao_Paulo
// (as funções de datas.ts já cuidam do fuso; aqui só as reaproveitamos).

import { horarioFuncionamento, type FaixaHorario } from '../../data/barbearia.ts'
import {
  diaDaSemana,
  formatarDDMM,
  formatarDiaSemana,
  formatarHHMM,
  hojeEmSP,
  somarDias,
  type DiaISO,
} from '../agendar/datas.ts'

// ---------------------------------------------------------------
// Tipos (já em camelCase; a tradução do que o banco devolve fica em api.ts)
// ---------------------------------------------------------------

export type StatusAgendamento =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu'

export interface Agendamento {
  id: string
  codigo: string
  status: StatusAgendamento
  /** timestamptz em texto ISO. */
  inicio: string
  fim: string
  barbeiroId: string
  barbeiroNome: string
  servicoNome: string
  servicoTipo: string
  clienteNome: string
  clienteTelefone: string
  /** Quando o pendente venceu e foi cancelado sozinho (status cancelado). Ausente ou null = cancelamento manual. */
  expiradoEm?: string | null
}

export interface Bloqueio {
  id: string
  /** null = a barbearia inteira (vale para todos os barbeiros). */
  barbeiroId: string | null
  barbeiroNome: string | null
  inicio: string
  fim: string
  motivo: string
}

export interface BarbeiroAtivo {
  id: string
  nome: string
}

// ---------------------------------------------------------------
// Dia escolhido (?dia=AAAA-MM-DD)
// ---------------------------------------------------------------

/** "2026-10-10" existe no calendário? (rejeita "2026-02-30" e formatos fora do padrão). */
export function ehDiaValido(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dd] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dd))
  return data.toISOString().slice(0, 10) === valor
}

/** Lê o parâmetro `dia` da URL. Ausente ou inválido cai em hoje. */
export function lerDia(parametro: string | null, hoje: DiaISO = hojeEmSP()): DiaISO {
  return parametro !== null && ehDiaValido(parametro) ? parametro : hoje
}

/**
 * Soma dias e só devolve se o resultado for um dia que `lerDia` aceita (de 0100-01-01 a 9999-12-31).
 * Fora disso devolve null: os botões de navegação usam isso para ficar desabilitados nas pontas,
 * em vez de gerar um dia que a URL descartaria (voltando para hoje sem avisar).
 */
export function somarDiasValidos(dia: DiaISO, quantidade: number): DiaISO | null {
  const resultado = somarDias(dia, quantidade)
  return ehDiaValido(resultado) ? resultado : null
}

/** "sexta, 10/10". */
export function rotuloDia(dia: DiaISO): string {
  return `${formatarDiaSemana(dia)}, ${formatarDDMM(dia)}`
}

// ---------------------------------------------------------------
// Hora e status
// ---------------------------------------------------------------

/** "09:00 – 09:40", sempre em São Paulo. */
export function formatarFaixaHora(inicio: string, fim: string): string {
  return `${formatarHHMM(inicio)} – ${formatarHHMM(fim)}`
}

const ROTULOS_STATUS: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

/**
 * Texto do status para a tela. Valor desconhecido (banco mais novo que o front) aparece como veio.
 * Cancelado pelo prazo (expirado = true) aparece como "Expirado", para a equipe distinguir de um cancelamento manual.
 */
export function rotuloStatus(status: StatusAgendamento, expirado = false): string {
  if (expirado && status === 'cancelado') return 'Expirado'
  return ROTULOS_STATUS[status] ?? status
}

/** Agendamento que ainda ocupa a agenda (cancelado não conta). */
export function estaAtivo(status: StatusAgendamento): boolean {
  return status !== 'cancelado'
}

/** Conta no total do resumo e dos cartões da Semana: tudo menos cancelado e não compareceu (quem faltou não foi atendido). */
export function contaComoAgendado(status: StatusAgendamento): boolean {
  return estaAtivo(status) && status !== 'nao_compareceu'
}

/** Números do resumo no topo do painel (Dia e Semana usam a mesma conta). */
export interface ContagemAtendimentos {
  /** Agendados: tudo menos cancelado e não compareceu (quem faltou não foi atendido). Concluído conta. */
  agendados: number
  /** Pendentes: pedem ação da equipe. */
  pendentes: number
  confirmados: number
  /** O pendente que começa primeiro (para o atalho "ver o primeiro pendente"); null se não há. */
  primeiroPendenteId: string | null
}

/** Conta o que veio, em qualquer ordem. Cancelado e não compareceu ficam fora de todos os números. */
export function contarAtendimentos(agendamentos: readonly Agendamento[]): ContagemAtendimentos {
  let agendados = 0
  let pendentes = 0
  let confirmados = 0
  let primeiro: Agendamento | null = null
  for (const a of agendamentos) {
    if (!contaComoAgendado(a.status)) continue
    agendados++
    if (a.status === 'confirmado') confirmados++
    if (a.status !== 'pendente') continue
    pendentes++
    if (primeiro === null || Date.parse(a.inicio) < Date.parse(primeiro.inicio)) primeiro = a
  }
  return { agendados, pendentes, confirmados, primeiroPendenteId: primeiro?.id ?? null }
}

// ---------------------------------------------------------------
// Grade das horas do dia
// ---------------------------------------------------------------

const MINUTOS_NO_DIA = 24 * 60

/** Minutos desde a meia-noite de SP do `dia`. Instante de outro dia vira 0 (antes) ou 1440 (depois). */
export function minutoNoDia(instante: string, dia: DiaISO): number {
  const diaDoInstante = hojeEmSP(new Date(instante))
  if (diaDoInstante < dia) return 0
  if (diaDoInstante > dia) return MINUTOS_NO_DIA
  const [hh, mm] = formatarHHMM(instante).split(':').map(Number)
  return hh * 60 + mm
}

export interface Grade {
  /** Minutos desde a meia-noite; sempre hora cheia. */
  inicioMin: number
  fimMin: number
  /** Hora de cada linha da grade (9, 10, 11...). */
  horas: number[]
}

function paraMinutos(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number)
  return hh * 60 + mm
}

/** Janela usada quando o horário de funcionamento não tem nenhuma faixa aberta. */
export const JANELA_PADRAO = { abre: 9 * 60, fecha: 20 * 60 }

/** Horário de abertura do dia; em dia fechado, a janela mais ampla da semana (a grade nunca fica sem horas). */
function janelaBase(dia: DiaISO, funcionamento: readonly FaixaHorario[]): { abre: number; fecha: number } {
  const faixas = funcionamento.filter(
    (f): f is FaixaHorario & { abre: string; fecha: string } => f.abre !== null && f.fecha !== null,
  )
  const doDia = faixas.filter((f) => f.dias.includes(diaDaSemana(dia)))
  const usadas = doDia.length > 0 ? doDia : faixas
  // Nenhuma faixa aberta em lugar nenhum: Math.min/max de lista vazia dariam Infinity.
  if (usadas.length === 0) return JANELA_PADRAO
  return {
    abre: Math.min(...usadas.map((f) => paraMinutos(f.abre))),
    fecha: Math.max(...usadas.map((f) => paraMinutos(f.fecha))),
  }
}

/**
 * Faixa de horas que a grade mostra: o funcionamento do dia, ampliado (em horas cheias)
 * para caber agendamento ativo fora dele. Cancelado e bloqueio não ampliam: ficam recortados na grade,
 * a não ser com `incluirCancelados` (filtro "Mostrar cancelados" ligado): aí o cancelado também amplia,
 * senão ele contaria no botão e não apareceria na tela.
 * `funcionamento` existe para os testes.
 */
export function calcularGrade(
  dia: DiaISO,
  agendamentos: readonly Agendamento[],
  funcionamento: readonly FaixaHorario[] = horarioFuncionamento,
  incluirCancelados = false,
): Grade {
  const base = janelaBase(dia, funcionamento)
  let inicioMin = base.abre
  let fimMin = base.fecha
  for (const a of agendamentos) {
    if (!incluirCancelados && !estaAtivo(a.status)) continue
    inicioMin = Math.min(inicioMin, minutoNoDia(a.inicio, dia))
    fimMin = Math.max(fimMin, minutoNoDia(a.fim, dia))
  }
  inicioMin = Math.floor(inicioMin / 60) * 60
  fimMin = Math.min(MINUTOS_NO_DIA, Math.ceil(fimMin / 60) * 60)
  const horas: number[] = []
  for (let m = inicioMin; m < fimMin; m += 60) horas.push(m / 60)
  return { inicioMin, fimMin, horas }
}

/** "15:20" a partir de minutos desde a meia-noite (a etiqueta da linha "agora"). */
export function rotuloMinutos(minutos: number): string {
  const hh = Math.floor(minutos / 60)
  const mm = minutos % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// Conversão de pixels em minutos: uma hora mede --spacing-hora (6rem = 96px em src/styles/index.css),
// então 1 min = 1,6px. Se esse token mudar, reveja as duas folgas abaixo.
// - Número da hora (text-xs, 16px de linha + pt-0.5): ocupa de ~1 a ~11 min DEPOIS da linha da hora cheia.
// - Etiqueta "agora" (12px de texto + py-0.5 = 16px de altura, centrada na linha): cobre ~5 min para cada lado.
// Os valores incluem uma margem de uns 3 min para o número não ficar colado na etiqueta.
const FOLGA_ANTES_DA_HORA_MIN = 8
const FOLGA_DEPOIS_DA_HORA_MIN = 18

/** A etiqueta "agora" cobriria o número desta hora cheia na calha? (perto demais: a hora cheia se esconde). */
export function etiquetaAgoraCobreHora(agoraMin: number, hora: number): boolean {
  const depois = agoraMin - hora * 60
  return depois > -FOLGA_ANTES_DA_HORA_MIN && depois < FOLGA_DEPOIS_DA_HORA_MIN
}

export interface Posicao {
  /** Distância do topo da grade, de 0 a 100. */
  topoPct: number
  alturaPct: number
}

/** Onde o intervalo cai na grade, em %. Recorta o que passa das bordas; fora da grade devolve null. */
export function posicaoNaGrade(
  grade: Grade,
  dia: DiaISO,
  inicio: string,
  fim: string,
): Posicao | null {
  const total = grade.fimMin - grade.inicioMin
  const de = Math.max(minutoNoDia(inicio, dia), grade.inicioMin)
  const ate = Math.min(minutoNoDia(fim, dia), grade.fimMin)
  if (total <= 0 || ate <= de) return null
  return {
    topoPct: ((de - grade.inicioMin) / total) * 100,
    alturaPct: ((ate - de) / total) * 100,
  }
}

/** Minutos entre dois instantes (arredondado). */
export function duracaoEmMinutos(inicio: string, fim: string): number {
  return Math.round((Date.parse(fim) - Date.parse(inicio)) / 60000)
}

/**
 * Quanto texto cabe no bloco, pela duração: 'linha' (até 29 min) mostra tudo em uma linha,
 * 'dupla' (até 44 min) mostra hora + status e o cliente, 'completa' acrescenta o serviço.
 */
export function densidadeDoBloco(minutos: number): 'linha' | 'dupla' | 'completa' {
  if (minutos < 30) return 'linha'
  if (minutos < 45) return 'dupla'
  return 'completa'
}

// ---------------------------------------------------------------
// Sobreposição dentro da coluna
// ---------------------------------------------------------------

export interface Faixa {
  /** Posição da esquerda para a direita (0 = primeira). */
  indice: number
  /** Quantas faixas o grupo de agendamentos sobrepostos tem. */
  total: number
}

/**
 * Agendamentos de um mesmo barbeiro podem se sobrepor quando há cancelado no meio (a constraint
 * do banco ignora cancelados). Em vez de empilhar um sobre o outro, dividimos a coluna em faixas.
 * Devolve id → faixa.
 */
export function distribuirFaixas(itens: readonly Pick<Agendamento, 'id' | 'inicio' | 'fim'>[]): Map<string, Faixa> {
  const ordenados = [...itens]
    .map((i) => ({ id: i.id, de: Date.parse(i.inicio), ate: Date.parse(i.fim) }))
    .sort((a, b) => a.de - b.de || a.ate - b.ate || a.id.localeCompare(b.id))

  const resultado = new Map<string, Faixa>()
  let grupo: string[] = []
  let fimDasFaixas: number[] = []
  let fimDoGrupo = -Infinity

  const fecharGrupo = () => {
    for (const id of grupo) {
      const f = resultado.get(id)
      if (f) f.total = fimDasFaixas.length
    }
    grupo = []
    fimDasFaixas = []
  }

  for (const item of ordenados) {
    if (item.de >= fimDoGrupo) fecharGrupo()
    let indice = fimDasFaixas.findIndex((fim) => fim <= item.de)
    if (indice === -1) indice = fimDasFaixas.length
    fimDasFaixas[indice] = item.ate
    fimDoGrupo = grupo.length === 0 ? item.ate : Math.max(fimDoGrupo, item.ate)
    grupo.push(item.id)
    resultado.set(item.id, { indice, total: 1 })
  }
  fecharGrupo()
  return resultado
}

// ---------------------------------------------------------------
// Colunas por barbeiro
// ---------------------------------------------------------------

export interface ColunaBarbeiro {
  barbeiroId: string
  nome: string
  agendamentos: Agendamento[]
  /** Bloqueios do barbeiro e os da barbearia inteira. */
  bloqueios: Bloqueio[]
}

/**
 * Uma coluna por barbeiro ativo (mesmo sem nenhum agendamento), na ordem recebida.
 * Barbeiro que não está na lista mas tem agendamento no dia (por exemplo, desativado depois)
 * ganha coluna ao final, para nenhum atendimento sumir da tela.
 * O mesmo vale para bloqueio de barbeiro ausente da lista (nome vindo do próprio bloqueio).
 * Bloqueio sem barbeiro vale para todas as colunas, inclusive as criadas assim.
 */
export function agruparPorBarbeiro(
  barbeiros: readonly BarbeiroAtivo[],
  agendamentos: readonly Agendamento[],
  bloqueios: readonly Bloqueio[],
): ColunaBarbeiro[] {
  const colunas = new Map<string, ColunaBarbeiro>()
  const todas: ColunaBarbeiro[] = []
  for (const b of barbeiros) {
    const coluna: ColunaBarbeiro = { barbeiroId: b.id, nome: b.nome, agendamentos: [], bloqueios: [] }
    colunas.set(b.id, coluna)
    todas.push(coluna)
  }

  for (const a of agendamentos) {
    let coluna = colunas.get(a.barbeiroId)
    if (!coluna) {
      coluna = { barbeiroId: a.barbeiroId, nome: a.barbeiroNome, agendamentos: [], bloqueios: [] }
      colunas.set(a.barbeiroId, coluna)
      todas.push(coluna)
    }
    coluna.agendamentos.push(a)
  }

  // Bloqueio de um barbeiro que não está na lista de ativos (ou sem agendamento no dia) também ganha
  // coluna, como o agendamento: senão a Semana contaria o bloqueio e o Dia o esconderia.
  // Primeiro os bloqueios de barbeiro (podem criar colunas); depois os da barbearia inteira, que vão para todas.
  for (const k of bloqueios) {
    if (k.barbeiroId === null) continue
    let coluna = colunas.get(k.barbeiroId)
    if (!coluna) {
      coluna = { barbeiroId: k.barbeiroId, nome: k.barbeiroNome ?? 'Barbeiro', agendamentos: [], bloqueios: [] }
      colunas.set(k.barbeiroId, coluna)
      todas.push(coluna)
    }
    coluna.bloqueios.push(k)
  }
  for (const k of bloqueios) {
    if (k.barbeiroId === null) for (const c of todas) c.bloqueios.push(k)
  }

  const porHorario = (a: { inicio: string }, b: { inicio: string }) =>
    Date.parse(a.inicio) - Date.parse(b.inicio)
  for (const c of todas) {
    c.agendamentos.sort(porHorario)
    c.bloqueios.sort(porHorario)
  }
  return todas
}
