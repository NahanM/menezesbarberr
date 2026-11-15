// Rascunho do /agendar: as escolhas e os dados digitados, guardados em sessionStorage para
// sobreviver a recarregar a página no meio do fluxo. Funções sem React, fáceis de testar.
//
// Por que sessionStorage e por que nome e telefone também entram:
//  - sessionStorage vive só na aba: fechou a aba, sumiu; outro aparelho não enxerga. Aba duplicada
//    herda uma cópia do que havia; aba nova aberta do zero começa vazia.
//  - A validade é curta (30 min sem mexer) e o rascunho é apagado ao reservar com sucesso.
//  - Nome e WhatsApp já ficam guardados por até 2 horas na reserva recente (reserva.ts), então
//    isto não amplia o que fica no aparelho. Sem eles, quem recarrega na revisão teria que redigitar.
//  - Nada aqui é segredo e nada vai para o servidor.
// Tudo que sai do storage é tratado como não confiável: o formato e os valores são conferidos.

import { barbeiros } from '../../data/barbearia.ts'
import { MAX_AVULSOS, ehCombo, buscarServico } from './catalogo.ts'
import type { DadosCliente } from './dados.ts'
import { hojeEmSP, type DiaISO, type DiaSelecionavel } from './datas.ts'
import { primeiroDiaAberto, type EstadoAgendar } from './estado.ts'

export const CHAVE_RASCUNHO = 'urbz:agendar-rascunho'

/** Quanto tempo o rascunho vale desde a última alteração. */
export const VALIDADE_RASCUNHO_MS = 30 * 60 * 1000

export interface Rascunho {
  estado: EstadoAgendar
  dados: DadosCliente
}

const MAX_NOME = 80 // igual ao maxLength do campo
const MAX_TELEFONE = 20

function ehTexto(v: unknown): v is string {
  return typeof v === 'string'
}

/** Serviços aceitos: todos existem; ou um combo sozinho, ou só avulsos (até o limite), sem repetir. */
function servicosValidos(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null
  const slugs: unknown[] = valor
  if (!slugs.every(ehTexto)) return null
  const lista = slugs as string[]
  if (new Set(lista).size !== lista.length) return null
  if (lista.some((s) => buscarServico(s) === undefined)) return null
  const combos = lista.filter(ehCombo).length
  if (combos > 0 && lista.length > 1) return null
  if (lista.length > MAX_AVULSOS) return null
  return lista
}

/**
 * Confere o que veio do storage e monta o rascunho. Devolve null se algo está fora do formato,
 * ou se o rascunho passou da validade. `dias` é a lista de dias da página (a janela de hoje).
 */
export function rascunhoValido(
  bruto: unknown,
  dias: DiaSelecionavel[],
  agora = Date.now(),
): Rascunho | null {
  if (typeof bruto !== 'object' || bruto === null) return null
  const v: Record<string, unknown> = { ...bruto }
  const { salvoEm } = v
  if (typeof salvoEm !== 'number' || !Number.isFinite(salvoEm)) return null
  if (salvoEm > agora || agora - salvoEm > VALIDADE_RASCUNHO_MS) return null

  const e = v.estado
  const d = v.dados
  if (typeof e !== 'object' || e === null || typeof d !== 'object' || d === null) return null
  const est: Record<string, unknown> = { ...e }
  const dad: Record<string, unknown> = { ...d }

  const servicos = servicosValidos(est.servicos)
  if (servicos === null) return null
  if (!ehTexto(dad.nome) || !ehTexto(dad.telefone)) return null

  const barbeiro = est.barbeiro
  if (barbeiro !== null && !(ehTexto(barbeiro) && barbeiros.some((b) => b.slug === barbeiro))) {
    return null
  }

  // O dia precisa estar na janela de hoje e aberto; senão volta ao primeiro dia aberto (e o horário cai junto).
  const diaGuardado = est.dia
  const diaOk =
    ehTexto(diaGuardado) && dias.some((x) => x.iso === diaGuardado && !x.fechado)
      ? (diaGuardado as DiaISO)
      : null
  const dia = diaOk ?? primeiroDiaAberto(dias)

  // O horário só vale se for do dia guardado, no futuro e uma data legível.
  let hora: string | null = null
  if (diaOk !== null && ehTexto(est.hora)) {
    const ms = Date.parse(est.hora)
    if (!Number.isNaN(ms) && ms > agora && hojeEmSP(new Date(ms)) === diaOk) hora = est.hora
  }

  return {
    estado: {
      servicos,
      barbeiro,
      dia,
      hora,
      horaPorConferir: hora !== null && est.horaPorConferir === true,
    },
    dados: { nome: dad.nome.slice(0, MAX_NOME), telefone: dad.telefone.slice(0, MAX_TELEFONE) },
  }
}

/** Não há o que guardar enquanto nada foi escolhido nem digitado. */
function vazio(estado: EstadoAgendar, dados: DadosCliente): boolean {
  return estado.servicos.length === 0 && dados.nome === '' && dados.telefone === ''
}

/** Guarda o rascunho (ou apaga o que havia, se não há nada). Se o storage falhar, segue sem ele. */
export function salvarRascunho(estado: EstadoAgendar, dados: DadosCliente, agora = Date.now()) {
  try {
    if (vazio(estado, dados)) {
      sessionStorage.removeItem(CHAVE_RASCUNHO)
      return
    }
    sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ estado, dados, salvoEm: agora }))
  } catch {
    // Storage bloqueado ou cheio: o fluxo funciona igual, só não sobrevive ao recarregar.
  }
}

/** Lê o rascunho. Corrompido, inválido ou vencido: apaga e devolve null. */
export function lerRascunho(dias: DiaSelecionavel[], agora = Date.now()): Rascunho | null {
  try {
    const texto = sessionStorage.getItem(CHAVE_RASCUNHO)
    if (texto === null) return null
    const rascunho = rascunhoValido(JSON.parse(texto) as unknown, dias, agora)
    if (rascunho === null) sessionStorage.removeItem(CHAVE_RASCUNHO)
    return rascunho
  } catch {
    return null
  }
}

/** Apaga o rascunho (depois de reservar com sucesso). */
export function limparRascunho() {
  try {
    sessionStorage.removeItem(CHAVE_RASCUNHO)
  } catch {
    // sem storage, nada a apagar
  }
}
