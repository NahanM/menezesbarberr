// Filtro dos cancelados na grade do Dia. Lógica pura (sem React): o estado mora na URL (?cancelados=1),
// no mesmo estilo do ?dia=, e aqui ficam só a leitura do parâmetro e a regra de quem aparece.

import type { Agendamento, ColunaBarbeiro } from './agenda.ts'

/** Nome do parâmetro da URL. */
export const PARAM_CANCELADOS = 'cancelados'

/** Lê `?cancelados=`. Só "1" liga; ausente ou qualquer outro valor é desligado (o padrão). */
export function lerCancelados(parametro: string | null): boolean {
  return parametro === '1'
}

/**
 * Quem aparece na grade. Desligado (padrão), os cancelados ficam de fora; ligado, entram todos.
 * Só `cancelado` sai: "não compareceu" e os demais status continuam sempre visíveis.
 */
export function filtrarCancelados<T extends Pick<Agendamento, 'status'>>(
  agendamentos: readonly T[],
  mostrarCancelados: boolean,
): T[] {
  return mostrarCancelados ? [...agendamentos] : agendamentos.filter((a) => a.status !== 'cancelado')
}

/** Quantos cancelados há na lista (o número do botão "Mostrar cancelados (N)"). */
export function contarCancelados(agendamentos: readonly Pick<Agendamento, 'status'>[]): number {
  return agendamentos.filter((a) => a.status === 'cancelado').length
}

/**
 * Aplica o filtro nas colunas da grade. Todas as colunas continuam existindo (mesmo ficando sem
 * agendamentos): o barbeiro não some só porque o dia dele tinha apenas cancelados. Bloqueios não mudam.
 */
export function colunasComFiltro(colunas: readonly ColunaBarbeiro[], mostrarCancelados: boolean): ColunaFiltrada[] {
  return colunas.map((c) => ({
    ...c,
    agendamentos: filtrarCancelados(c.agendamentos, mostrarCancelados),
    canceladosOcultos: mostrarCancelados ? 0 : contarCancelados(c.agendamentos),
  }))
}

/** Coluna já filtrada, com quantos cancelados ficaram de fora dela (0 com o filtro ligado). */
export interface ColunaFiltrada extends ColunaBarbeiro {
  canceladosOcultos: number
}

/**
 * Frase da coluna sem nada para desenhar. Se o que sobrou é só cancelado escondido, diz isso em vez de
 * "Sem agendamentos" (que passaria a ideia de dia livre). `null` = a coluna tem algo para mostrar.
 */
export function textoColunaVazia(
  coluna: Pick<ColunaFiltrada, 'agendamentos' | 'bloqueios' | 'canceladosOcultos'>,
): string | null {
  if (coluna.agendamentos.length > 0 || coluna.bloqueios.length > 0) return null
  const n = coluna.canceladosOcultos
  if (n === 0) return 'Sem agendamentos'
  return `${n} ${n === 1 ? 'cancelado oculto' : 'cancelados ocultos'}`
}

/**
 * O botão do filtro aparece quando há cancelado no dia ou quando o filtro está ligado: ligado e sem
 * cancelados (o filtro veio na URL), o botão continua ali para a pessoa ver e desligar.
 */
export function mostrarBotaoCancelados(totalCancelados: number, filtroLigado: boolean): boolean {
  return totalCancelados > 0 || filtroLigado
}

/** Texto do botão: o rótulo muda com o estado (no lugar de aria-pressed) e leva a quantidade; com 0, sem "(0)". */
export function rotuloBotaoCancelados(totalCancelados: number, filtroLigado: boolean): string {
  const base = `${filtroLigado ? 'Ocultar' : 'Mostrar'} cancelados`
  return totalCancelados > 0 ? `${base} (${totalCancelados})` : base
}

/**
 * Frase para a região aria-live depois de alternar o filtro. Trocar o nome do botão com o foco nele
 * não costuma ser anunciado, então a frase diz o resultado. `ligou` = o filtro acabou de ser ligado.
 */
export function avisoCancelados(totalCancelados: number, ligou: boolean): string {
  return ligou ? `Cancelados visíveis: ${totalCancelados}` : 'Cancelados ocultos'
}
