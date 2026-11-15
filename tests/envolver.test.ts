import { describe, expect, it } from 'vitest'
import { envolver } from '../src/lib/envolver.ts'

describe('envolver(min, max, valor)', () => {
  it('valor dentro da faixa não muda', () => {
    expect(envolver(-25, 0, -10)).toBe(-10)
  })
  it('valor no min fica no min', () => {
    expect(envolver(-25, 0, -25)).toBe(-25)
  })
  it('valor no max volta para o min (intervalo é [min, max))', () => {
    expect(envolver(-25, 0, 0)).toBe(-25)
    expect(envolver(0, 10, 10)).toBe(0)
  })
  it('negativo abaixo do min dá a volta (exemplos do comentário)', () => {
    expect(envolver(-25, 0, -26)).toBe(-1)
    expect(envolver(0, 10, -1)).toBe(9)
  })
  it('várias voltas para cima e para baixo', () => {
    expect(envolver(0, 10, 1000003)).toBe(3)
    expect(envolver(0, 10, -1000003)).toBe(7)
    expect(envolver(-25, 0, -25 * 40 - 5)).toBe(-5)
  })
  it('resultado sempre em [min, max)', () => {
    for (let v = -300; v <= 300; v += 7.3) {
      const r = envolver(-25, 0, v)
      expect(r).toBeGreaterThanOrEqual(-25)
      expect(r).toBeLessThan(0)
    }
  })
  it('funciona com faixa decimal', () => {
    expect(envolver(0, 0.5, 1.25)).toBeCloseTo(0.25)
  })
})
