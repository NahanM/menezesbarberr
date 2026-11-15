// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diasSelecionaveis } from '../../src/lib/agendar/datas.ts'
import type { EstadoAgendar } from '../../src/lib/agendar/estado.ts'
import {
  CHAVE_RASCUNHO,
  VALIDADE_RASCUNHO_MS,
  lerRascunho,
  limparRascunho,
  rascunhoValido,
  salvarRascunho,
} from '../../src/lib/agendar/rascunho.ts'

// Sexta 09/10/2026 12:00 em SP. Segunda e domingo fechados.
const AGORA = new Date('2026-10-09T15:00:00Z')
const dias = diasSelecionaveis(AGORA, 30)
const T0 = AGORA.getTime()

const estado: EstadoAgendar = {
  servicos: ['essencial'],
  barbeiro: 'rafael',
  dia: '2026-10-14',
  hora: '2026-10-14T12:00:00+00:00',
  horaPorConferir: false,
}
const dados = { nome: 'João Silva', telefone: '(11) 99999-8888' }
const bruto = (extra: object = {}) => ({ estado, dados, salvoEm: T0, ...extra })

// Vitest roda em node: sem sessionStorage de verdade, usamos um falso de memória.
function falsoStorage() {
  const mapa = new Map<string, string>()
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
  }
}

describe('rascunhoValido', () => {
  it('aceita um rascunho bom e devolve o mesmo conteúdo', () => {
    expect(rascunhoValido(bruto(), dias, T0 + 1000)).toEqual({ estado, dados })
  })
  it('guarda horaPorConferir quando há horário', () => {
    const r = rascunhoValido(
      bruto({ estado: { ...estado, horaPorConferir: true } }),
      dias,
      T0 + 1000,
    )
    expect(r?.estado.horaPorConferir).toBe(true)
  })
  it('vence depois de 30 minutos e rejeita data do futuro', () => {
    expect(rascunhoValido(bruto(), dias, T0 + VALIDADE_RASCUNHO_MS)).not.toBeNull()
    expect(rascunhoValido(bruto(), dias, T0 + VALIDADE_RASCUNHO_MS + 1)).toBeNull()
    expect(rascunhoValido(bruto({ salvoEm: T0 + 5000 }), dias, T0)).toBeNull()
  })
  it('rejeita formato errado e lixo', () => {
    for (const lixo of [null, 'texto', 42, [], {}, bruto({ salvoEm: 'x' }), bruto({ estado: null })]) {
      expect(rascunhoValido(lixo, dias, T0)).toBeNull()
    }
    expect(rascunhoValido(bruto({ dados: { nome: 1, telefone: 2 } }), dias, T0)).toBeNull()
  })
  it('rejeita serviço inexistente, repetido, combo misturado e avulsos demais', () => {
    const com = (servicos: unknown) => bruto({ estado: { ...estado, servicos } })
    expect(rascunhoValido(com(['nao-existe']), dias, T0)).toBeNull()
    expect(rascunhoValido(com(['corte', 'corte']), dias, T0)).toBeNull()
    expect(rascunhoValido(com(['essencial', 'corte']), dias, T0)).toBeNull()
    expect(rascunhoValido(com('corte'), dias, T0)).toBeNull()
    expect(rascunhoValido(com([1]), dias, T0)).toBeNull()
    expect(rascunhoValido(com(['corte', 'barba']), dias, T0)).not.toBeNull()
  })
  it('rejeita barbeiro inexistente; aceita null (sem preferência)', () => {
    expect(rascunhoValido(bruto({ estado: { ...estado, barbeiro: 'zé' } }), dias, T0)).toBeNull()
    expect(rascunhoValido(bruto({ estado: { ...estado, barbeiro: null } }), dias, T0)).not.toBeNull()
  })
  it('dia fora da janela ou fechado volta ao primeiro dia aberto e o horário cai junto', () => {
    const passado = rascunhoValido(bruto({ estado: { ...estado, dia: '2026-01-01' } }), dias, T0)
    expect(passado?.estado).toMatchObject({ dia: '2026-10-09', hora: null, horaPorConferir: false })
    // 12/10/2026 é segunda: fechado.
    const segunda = rascunhoValido(bruto({ estado: { ...estado, dia: '2026-10-12' } }), dias, T0)
    expect(segunda?.estado).toMatchObject({ dia: '2026-10-09', hora: null })
  })
  it('horário de outro dia, no passado ou ilegível é descartado', () => {
    const h = (hora: unknown) => rascunhoValido(bruto({ estado: { ...estado, hora } }), dias, T0)
    expect(h('2026-10-15T12:00:00+00:00')?.estado.hora).toBeNull() // outro dia
    expect(h('2026-10-14T12:00:00+00:00')?.estado.hora).not.toBeNull()
    expect(h('não é data')?.estado.hora).toBeNull()
    expect(h(123)?.estado.hora).toBeNull()
    const ontem = rascunhoValido(
      bruto({ estado: { ...estado, dia: '2026-10-09', hora: '2026-10-09T12:00:00+00:00' } }),
      dias,
      T0,
    )
    expect(ontem?.estado.hora).toBeNull() // 09:00 SP de hoje já passou às 12:00 SP
  })
  it('corta nome e telefone grandes demais', () => {
    const r = rascunhoValido(
      bruto({ dados: { nome: 'a'.repeat(500), telefone: '1'.repeat(500) } }),
      dias,
      T0,
    )
    expect(r?.dados.nome).toHaveLength(80)
    expect(r?.dados.telefone).toHaveLength(20)
  })
  it('não deixa campos extras do storage passarem (__proto__ não polui)', () => {
    const sujo = JSON.parse(
      JSON.stringify(bruto()).replace('{', '{"__proto__":{"polluted":true},'),
    ) as unknown
    const r = rascunhoValido(sujo, dias, T0)
    expect(r).toEqual({ estado, dados })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('salvar / ler / limpar', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', falsoStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guarda e lê de volta', () => {
    salvarRascunho(estado, dados, T0)
    expect(lerRascunho(dias, T0 + 60_000)).toEqual({ estado, dados })
  })
  it('vencido: devolve null e apaga', () => {
    salvarRascunho(estado, dados, T0)
    expect(lerRascunho(dias, T0 + VALIDADE_RASCUNHO_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(CHAVE_RASCUNHO)).toBeNull()
  })
  it('JSON corrompido: null e apaga', () => {
    sessionStorage.setItem(CHAVE_RASCUNHO, '{quebrado')
    expect(lerRascunho(dias, T0)).toBeNull()
  })
  it('nada escolhido nem digitado: não guarda e apaga o anterior', () => {
    salvarRascunho(estado, dados, T0)
    salvarRascunho({ ...estado, servicos: [], hora: null }, { nome: '', telefone: '' }, T0)
    expect(sessionStorage.getItem(CHAVE_RASCUNHO)).toBeNull()
  })
  it('limparRascunho apaga', () => {
    salvarRascunho(estado, dados, T0)
    limparRascunho()
    expect(lerRascunho(dias, T0)).toBeNull()
  })
  it('storage bloqueado não lança exceção', () => {
    const bloqueado = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    vi.stubGlobal('sessionStorage', bloqueado)
    expect(() => salvarRascunho(estado, dados, T0)).not.toThrow()
    expect(lerRascunho(dias, T0)).toBeNull()
    expect(() => limparRascunho()).not.toThrow()
  })
})
