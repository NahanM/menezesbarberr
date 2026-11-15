import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, expect, it } from 'vitest'
import { MAX_AVULSOS, ehCombo, resumirServicos } from '../../src/lib/agendar/catalogo.ts'

describe('resumirServicos', () => {
  it('um avulso: o próprio nome, preço e duração', () => {
    expect(resumirServicos(['corte'])).toEqual({
      nome: 'Corte',
      precoCentavos: 5000,
      duracaoMinutos: 40,
      quantidade: 1,
    })
  })
  it('vários avulsos: nomes juntos na ordem recebida, preço e duração somados', () => {
    expect(resumirServicos(['corte', 'sobrancelha'])).toEqual({
      nome: 'Corte + Sobrancelha',
      precoCentavos: 6500,
      duracaoMinutos: 55,
      quantidade: 2,
    })
  })
  it('combo: valores do combo', () => {
    const r = resumirServicos(['essencial'])
    expect(r?.nome).toBe('Essencial')
    expect(r?.precoCentavos).toBe(8000)
  })
  it('lista vazia ou só slugs desconhecidos: undefined; desconhecido misturado é ignorado', () => {
    expect(resumirServicos([])).toBeUndefined()
    expect(resumirServicos(['nao-existe'])).toBeUndefined()
    expect(resumirServicos(['nao-existe', 'barba'])?.nome).toBe('Barba')
  })
  it('ehCombo e limite', () => {
    expect(ehCombo('essencial')).toBe(true)
    expect(ehCombo('corte')).toBe(false)
    expect(ehCombo('nao-existe')).toBe(false)
    expect(MAX_AVULSOS).toBe(5)
  })
})
