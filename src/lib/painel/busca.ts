// Montagem da query string do /painel. Lógica pura (sem React): um lugar só decide a ordem e o que vai na URL,
// para o seletor de visão, o cartão do dia e o link de pendentes não divergirem.

import type { DiaISO } from '../agendar/datas.ts'
import { PARAM_CANCELADOS } from './cancelados.ts'

export type VisaoPainel = 'dia' | 'semana'

/**
 * Monta a busca do painel do zero: visao (só quando é semana), dia e cancelados (só quando ligado), nessa ordem.
 * Assim a URL do Dia fica "?dia=...". Ligado, o filtro dos cancelados vai junto ao trocar de dia ou de visão.
 */
export function montarBuscaPainel(visao: VisaoPainel, dia: DiaISO, cancelados: boolean): URLSearchParams {
  const busca = new URLSearchParams()
  if (visao === 'semana') busca.set('visao', 'semana')
  busca.set('dia', dia)
  if (cancelados) busca.set(PARAM_CANCELADOS, '1')
  return busca
}
