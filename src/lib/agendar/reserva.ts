// A reserva que acabou de ser criada, guardada para a tela de sucesso (/agendar/sucesso).
// Fica em sessionStorage: sobrevive a recarregar a página e a o WhatsApp fechar a aba do
// navegador, mas some quando a aba é fechada. Nada aqui é segredo: é o que a pessoa acabou de digitar
// mais o código que o servidor devolveu. Funções sem React, fáceis de testar.

export interface ReservaRecente {
  codigo: string
  servico_nome: string
  barbeiro_nome: string
  /** timestamptz em texto ISO. */
  inicio: string
  nome: string
  /** Soma dos preços devolvida pelo servidor. Ausente em reservas guardadas antes dos combinados. */
  preco_centavos?: number
  /** Soma das durações devolvida pelo servidor. */
  duracao_min?: number
}

export const CHAVE_RESERVA = 'urbz:reserva-recente'

/** Confere o formato: o state do router e o sessionStorage podem trazer qualquer coisa. */
export function ehReservaRecente(valor: unknown): valor is ReservaRecente {
  if (typeof valor !== 'object' || valor === null) return false
  const v: Record<string, unknown> = { ...valor }
  return (
    typeof v.codigo === 'string' &&
    typeof v.servico_nome === 'string' &&
    typeof v.barbeiro_nome === 'string' &&
    typeof v.inicio === 'string' &&
    !Number.isNaN(Date.parse(v.inicio)) &&
    typeof v.nome === 'string' &&
    (v.preco_centavos === undefined || typeof v.preco_centavos === 'number') &&
    (v.duracao_min === undefined || typeof v.duracao_min === 'number')
  )
}

/** Quanto tempo a reserva fica guardada: depois disso o código some do aparelho. */
export const VALIDADE_RESERVA_MS = 2 * 60 * 60 * 1000

/** O que fica guardado e viaja no state: a reserva mais a hora (ms) em que foi salva. */
export type ReservaGuardada = ReservaRecente & { salvoEm: number }

/**
 * Confere formato E validade, a mesma regra para o storage e para o state do router:
 * precisa ter `salvoEm` numérico, que não seja do futuro nem tenha mais de 2 horas.
 */
export function reservaValida(valor: unknown, agora = Date.now()): ReservaRecente | null {
  if (!ehReservaRecente(valor)) return null
  const { salvoEm } = valor as ReservaRecente & { salvoEm?: unknown }
  if (typeof salvoEm !== 'number' || !Number.isFinite(salvoEm)) return null
  if (salvoEm > agora || agora - salvoEm > VALIDADE_RESERVA_MS) return null
  return {
    codigo: valor.codigo,
    servico_nome: valor.servico_nome,
    barbeiro_nome: valor.barbeiro_nome,
    inicio: valor.inicio,
    nome: valor.nome,
    ...(valor.preco_centavos === undefined ? {} : { preco_centavos: valor.preco_centavos }),
    ...(valor.duracao_min === undefined ? {} : { duracao_min: valor.duracao_min }),
  }
}

/**
 * Guarda a reserva com a hora em que foi salva e devolve o que guardou (para ir no state da
 * navegação). Se o storage falhar, seguimos só com o state.
 */
export function salvarReserva(reserva: ReservaRecente, agora = Date.now()): ReservaGuardada {
  const guardada = { ...reserva, salvoEm: agora }
  try {
    sessionStorage.setItem(CHAVE_RESERVA, JSON.stringify(guardada))
  } catch {
    // Sem storage: o navigate state ainda leva os dados até a tela de sucesso.
  }
  return guardada
}

/**
 * Lê a reserva guardada. Devolve null se não há, se está corrompida, se é inválida ou
 * expirada (e nesse caso apaga) ou se o storage está bloqueado.
 */
export function lerReserva(agora = Date.now()): ReservaRecente | null {
  try {
    const texto = sessionStorage.getItem(CHAVE_RESERVA)
    if (texto === null) return null
    const reserva = reservaValida(JSON.parse(texto) as unknown, agora)
    if (reserva === null) sessionStorage.removeItem(CHAVE_RESERVA)
    return reserva
  } catch {
    return null
  }
}
