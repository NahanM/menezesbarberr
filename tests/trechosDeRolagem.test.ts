import { describe, expect, it } from 'vitest'
import { linhaDoTempoFrases, linhaDoTempoPosts, normalizarFases } from '../src/lib/trechosDeRolagem.ts'

const F = { entrada: 0.35, pausa: 0.3, saida: 0.35 }

describe('normalizarFases', () => {
  it('só a proporção importa', () => {
    const a = normalizarFases({ entrada: 35, pausa: 30, saida: 35 })
    expect(a.entrada).toBeCloseTo(0.35)
    expect(a.pausa).toBeCloseTo(0.3)
    expect(a.saida).toBeCloseTo(0.35)
    const n = normalizarFases({ entrada: 2, pausa: 1, saida: 1 })
    expect(n.entrada + n.pausa + n.saida).toBeCloseTo(1)
    expect(n.entrada).toBeCloseTo(0.5)
  })
  it('valor inválido volta ao padrão 35/30/35', () => {
    expect(normalizarFases({ entrada: 0, pausa: 0, saida: 0 })).toEqual(F)
    expect(normalizarFases({ entrada: -1, pausa: 1, saida: 1 })).toEqual(F)
  })
})

describe('linhaDoTempoFrases', () => {
  const l = linhaDoTempoFrases(3, F)
  it('total = frases + pausa do fechamento', () => {
    expect(l.totalEtapas).toBeCloseTo(3.3)
  })
  it('a pausa de cada frase tem 30% de uma etapa', () => {
    for (let i = 0; i < 3; i++) {
      const t = l.frase(i).pausa
      expect((t[1] - t[0]) * l.totalEtapas).toBeCloseTo(0.3)
    }
    expect((l.fechamento.pausa[1] - l.fechamento.pausa[0]) * l.totalEtapas).toBeCloseTo(0.3)
  })
  it('a saída de uma frase termina junto com a pausa da próxima começar, e ela só entra durante essa troca', () => {
    for (let i = 0; i < 3; i++) {
      expect(l.frase(i).saida[1]).toBeCloseTo(i === 2 ? l.fechamento.pausa[0] : l.frase(i + 1).pausa[0])
    }
    for (let i = 1; i < 3; i++) {
      expect(l.frase(i).entrada[0]).toBeCloseTo(l.frase(i - 1).pausa[1]) // começa quando a pausa da anterior termina
      expect(l.frase(i).entrada[1]).toBeLessThanOrEqual(l.frase(i - 1).saida[1] + 1e-9)
    }
    expect(l.fechamento.entrada[0]).toBeCloseTo(l.frase(2).pausa[1])
  })
  it('o fechamento termina em 1', () => {
    expect(l.fechamento.pausa[1]).toBeCloseTo(1)
  })
  it('a saída da frase e a entrada da próxima se encavalam (crossfade, sem vão)', () => {
    for (let i = 0; i < 2; i++) {
      expect(l.frase(i + 1).entrada[0]).toBeLessThan(l.frase(i).saida[1])
      expect(l.frase(i + 1).entrada[1]).toBeGreaterThan(l.frase(i).saida[0])
    }
  })
  it('em qualquer ponto do trilho alguma frase (ou o fechamento) está com opacidade >= 0,6', () => {
    const rampa = ([a, b]: [number, number], v: number) => (b === a ? 1 : Math.min(1, Math.max(0, (v - a) / (b - a))))
    for (let k = 0; k <= 2000; k++) {
      const x = k / 2000
      const frases = [0, 1, 2].map((i) => {
        const t = l.frase(i)
        return Math.min(i === 0 ? 1 : rampa(t.entrada, x), 1 - rampa(t.saida, x))
      })
      const melhor = Math.max(...frases, rampa(l.fechamento.entrada, x))
      expect(melhor, `progresso ${x}`).toBeGreaterThanOrEqual(0.6 - 1e-9)
    }
  })
  it('sem sobreposição o pior ponto é 50% (e com ela, mais que isso)', () => {
    const rampa = ([a, b]: [number, number], v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)))
    const pior = (o: number) => {
      const t = linhaDoTempoFrases(3, F, o)
      let m = 1
      for (let k = 0; k <= 2000; k++) {
        const x = k / 2000
        const velha = 1 - rampa(t.frase(1).saida, x)
        const nova = rampa(t.frase(2).entrada, x)
        if (x > t.frase(1).pausa[1] && x < t.frase(2).pausa[0]) m = Math.min(m, Math.max(velha, nova))
      }
      return m
    }
    expect(pior(0)).toBeCloseTo(0.5, 1)
    expect(pior(0.25)).toBeGreaterThan(0.6)
  })
})

describe('linhaDoTempoPosts', () => {
  const l = linhaDoTempoPosts(3, F)
  it('total = n x (entrada + pausa)', () => {
    expect(l.totalEtapas).toBeCloseTo(3 * 0.65)
  })
  it('o post sobe, fica parado por 30% de etapa e só então o próximo sobe', () => {
    const [, fimSobe1] = l.sobe(1)
    const [iniSobe2] = l.sobe(2)
    expect((iniSobe2 - fimSobe1) * l.totalEtapas).toBeCloseTo(0.3)
  })
  it('o post é coberto exatamente até o fim da subida do próximo', () => {
    expect(l.coberto(0)[1]).toBeCloseTo(l.sobe(1)[1])
    expect(l.coberto(1)[1]).toBeCloseTo(l.sobe(2)[1])
  })
  it('a última subida termina antes do fim, deixando a pausa do último post', () => {
    expect(l.sobe(2)[1]).toBeLessThan(1)
    expect((1 - l.sobe(2)[1]) * l.totalEtapas).toBeCloseTo(0.3)
  })
  it('o meio da pausa fica entre o fim da subida e o início da próxima', () => {
    expect(l.meioDaPausa(1)).toBeGreaterThan(l.sobe(1)[1])
    expect(l.meioDaPausa(1)).toBeLessThan(l.sobe(2)[0])
  })
})
