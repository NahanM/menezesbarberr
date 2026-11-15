import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAVE_RESERVA,
  VALIDADE_RESERVA_MS,
  ehReservaRecente,
  lerReserva,
  reservaValida,
  salvarReserva,
  type ReservaRecente,
} from '../../src/lib/agendar/reserva.ts'

const RESERVA: ReservaRecente = {
  codigo: 'K7M2PX',
  servico_nome: 'Essencial',
  barbeiro_nome: 'Rafael',
  inicio: '2026-10-14T12:00:00+00:00',
  nome: 'João',
}

// Vitest roda em node: sem sessionStorage de verdade, usamos um falso de memória.
function falsoStorage() {
  const dados = new Map<string, string>()
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  }
}

describe('reserva com soma de serviços', () => {
  it('aceita preco_centavos e duracao_min numéricos e mantém na validação', () => {
    const r = { ...RESERVA, preco_centavos: 6500, duracao_min: 55, salvoEm: 1000 }
    expect(ehReservaRecente(r)).toBe(true)
    expect(reservaValida(r, 2000)).toMatchObject({ preco_centavos: 6500, duracao_min: 55 })
  })
  it('reserva antiga (sem os campos) continua válida', () => {
    expect(ehReservaRecente(RESERVA)).toBe(true)
    expect(reservaValida({ ...RESERVA, salvoEm: 1000 }, 2000)).toEqual(RESERVA)
  })
  it('preco_centavos de tipo errado é rejeitado', () => {
    expect(ehReservaRecente({ ...RESERVA, preco_centavos: '6500' })).toBe(false)
  })
})

describe('reserva recente', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', falsoStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guarda e lê de volta', () => {
    salvarReserva(RESERVA)
    expect(lerReserva()).toEqual(RESERVA)
  })

  it('depois de 2 horas a reserva é descartada e apagada', () => {
    const t0 = Date.parse('2026-10-14T10:00:00Z')
    salvarReserva(RESERVA, t0)
    expect(lerReserva(t0 + VALIDADE_RESERVA_MS)).toEqual(RESERVA)
    expect(lerReserva(t0 + VALIDADE_RESERVA_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(CHAVE_RESERVA)).toBeNull()
  })

  it('reserva sem salvoEm (formato antigo) é descartada', () => {
    sessionStorage.setItem(CHAVE_RESERVA, JSON.stringify(RESERVA))
    expect(lerReserva()).toBeNull()
  })

  it('salvoEm no futuro é inválido, e reservaValida usa a mesma regra para o state', () => {
    const t0 = Date.parse('2026-10-14T10:00:00Z')
    const guardada = salvarReserva(RESERVA, t0)
    expect(guardada.salvoEm).toBe(t0)
    expect(reservaValida(guardada, t0 + 1000)).toEqual(RESERVA)
    expect(reservaValida(guardada, t0 - 1)).toBeNull()
    expect(reservaValida(guardada, t0 + VALIDADE_RESERVA_MS + 1)).toBeNull()
    expect(reservaValida(RESERVA, t0)).toBeNull() // state sem salvoEm
    expect(reservaValida({ ...guardada, salvoEm: 'agora' }, t0)).toBeNull()
  })

  it('sem nada guardado devolve null', () => {
    expect(lerReserva()).toBeNull()
  })

  it('JSON corrompido ou com formato errado devolve null', () => {
    sessionStorage.setItem(CHAVE_RESERVA, '{nao é json')
    expect(lerReserva()).toBeNull()
    sessionStorage.setItem(CHAVE_RESERVA, JSON.stringify({ codigo: 1 }))
    expect(lerReserva()).toBeNull()
  })

  it('storage bloqueado não quebra nem ao salvar nem ao ler', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(() => salvarReserva(RESERVA)).not.toThrow()
    expect(lerReserva()).toBeNull()
  })

  it('ehReservaRecente recusa data inválida e lixo', () => {
    expect(ehReservaRecente(RESERVA)).toBe(true)
    expect(ehReservaRecente({ ...RESERVA, inicio: 'ontem' })).toBe(false)
    expect(ehReservaRecente(null)).toBe(false)
    expect(ehReservaRecente('texto')).toBe(false)
  })
})
