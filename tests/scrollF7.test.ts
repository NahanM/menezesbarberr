import { describe, expect, it } from 'vitest'
import {
  COMBOS_ENTRADA, COMBOS_PAUSA, COMBOS_SAIDA, COMBOS_VH_DESKTOP, FRASES_DESLOCAMENTO_PX, FRASES_DESLOCAMENTO_ULTIMA_PX,
  FRASES_ENTRADA, FRASES_PAUSA, FRASES_RESPIRO, FRASES_SAIDA, FRASES_SOBREPOSICAO, FRASES_VH_DESKTOP, MOLA_AMORTECIMENTO, MOLA_RIGIDEZ,
} from '../src/config/scroll'
import { linhaDoTempoFrases, linhaDoTempoPosts } from '../src/lib/trechosDeRolagem'

const bruto = { entrada: FRASES_ENTRADA, pausa: FRASES_PAUSA, saida: FRASES_SAIDA }
const ALTURA = 900

describe('F7: config e respiro', () => {
  it('valores combinados', () => {
    expect([FRASES_VH_DESKTOP, COMBOS_VH_DESKTOP, MOLA_RIGIDEZ, MOLA_AMORTECIMENTO, FRASES_SOBREPOSICAO]).toEqual([60, 60, 400, 40, 0])
    expect([FRASES_DESLOCAMENTO_PX, FRASES_DESLOCAMENTO_ULTIMA_PX, FRASES_RESPIRO]).toEqual([60, 120, 0.5])
    expect(MOLA_AMORTECIMENTO).toBeCloseTo(2 * Math.sqrt(MOLA_RIGIDEZ), 5)
  })
  it('respiro 0 mantém o comportamento antigo e 0,5 alonga só o fim', () => {
    const a = linhaDoTempoFrases(3, bruto, 0, 0)
    const b = linhaDoTempoFrases(3, bruto, 0, FRASES_RESPIRO)
    expect(b.totalEtapas - a.totalEtapas).toBeCloseTo(0.5, 9)
    expect(linhaDoTempoFrases(3, bruto, 0).totalEtapas).toBe(a.totalEtapas)
    for (let i = 0; i < 3; i++) {
      for (const k of ['entrada', 'pausa', 'saida'] as const) {
        expect(b.frase(i)[k][0] * b.totalEtapas).toBeCloseTo(a.frase(i)[k][0] * a.totalEtapas, 9)
        expect(b.frase(i)[k][1] * b.totalEtapas).toBeCloseTo(a.frase(i)[k][1] * a.totalEtapas, 9)
      }
    }
    expect(b.fechamento.pausa[1]).toBe(1)
  })
  it('respiro de 30vh: a pausa do fechamento dura o respiro (30vh) mais a pausa normal, em 900px', () => {
    const l = linhaDoTempoFrases(3, bruto, FRASES_SOBREPOSICAO, FRASES_RESPIRO)
    const trilhoPx = (l.totalEtapas * FRASES_VH_DESKTOP * ALTURA) / 100
    const pausaPx = (l.fechamento.pausa[1] - l.fechamento.pausa[0]) * trilhoPx
    expect(pausaPx).toBeGreaterThanOrEqual(0.3 * ALTURA + 150)
  })
  it('respiro negativo não quebra e vira 0', () => {
    expect(linhaDoTempoFrases(3, bruto, 0, -2).totalEtapas).toBeCloseTo(linhaDoTempoFrases(3, bruto, 0, 0).totalEtapas, 9)
  })
  it('trechos dentro de [0,1] e fechamento entra antes de pausar', () => {
    const l = linhaDoTempoFrases(3, bruto, 0, 0.5)
    const v = [0, 1, 2].flatMap((i) => [...l.frase(i).entrada, ...l.frase(i).pausa, ...l.frase(i).saida])
    for (const x of [...v, ...l.fechamento.entrada, ...l.fechamento.pausa]) expect(x >= 0 && x <= 1).toBe(true)
    expect(l.fechamento.entrada[1]).toBeLessThanOrEqual(l.fechamento.pausa[0] + 1e-9)
  })
  it('combos: fases somam 1 e pausa >= 150px em 900px', () => {
    expect(COMBOS_ENTRADA + COMBOS_PAUSA + COMBOS_SAIDA).toBeCloseTo(1, 9)
    expect((COMBOS_VH_DESKTOP / 100) * COMBOS_PAUSA * ALTURA).toBeGreaterThanOrEqual(150)
    expect(linhaDoTempoPosts(3, { entrada: COMBOS_ENTRADA, pausa: COMBOS_PAUSA, saida: COMBOS_SAIDA })).toBeDefined()
  })
  it('frases: pausa >= 175px em 900px (folga da grade de 25px)', () => {
    expect((FRASES_VH_DESKTOP / 100) * FRASES_PAUSA * ALTURA).toBeGreaterThanOrEqual(175)
  })
})
