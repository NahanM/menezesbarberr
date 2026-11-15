import { describe, expect, it } from 'vitest'
import { formatarDuracao, formatarPreco } from '../src/lib/formatar.ts'

describe('formatarPreco', () => {
  it.each([
    [8000, 'R$ 80,00'],
    [14500, 'R$ 145,00'],
    [16000, 'R$ 160,00'],
    [0, 'R$ 0,00'],
    [8050, 'R$ 80,50'],
    [1, 'R$ 0,01'],
    [99, 'R$ 0,99'],
    [123456, 'R$ 1.234,56'],
  ])('%i vira %s', (centavos, esperado) => {
    expect(formatarPreco(centavos)).toBe(esperado)
  })

  it('usa espaço comum (sem NBSP)', () => {
    expect(formatarPreco(8000)).not.toMatch(/\u00a0|\u202f/)
  })
})

describe('formatarDuracao', () => {
  it.each([
    [30, '30 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1h'],
    [75, '1h15'],
    [65, '1h05'],
    [120, '2h'],
    [0, '0 min'],
  ])('%i vira %s', (min, esperado) => {
    expect(formatarDuracao(min)).toBe(esperado)
  })
})
