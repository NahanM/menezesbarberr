import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { barbeiros, combos, horarioFuncionamento, servicosAvulsos } from '../src/data/barbearia.ts'

// Catálogo real da MENEZES BARBER's: o front (src/data/barbearia.ts) e o banco (supabase/seed.sql)
// precisam dizer a mesma coisa. Se um mudar e o outro não, o /agendar oferece um serviço que o
// servidor recusa (ou com outro preço).
const seed = readFileSync('supabase/seed.sql', 'utf8')
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('catálogo da Menezes', () => {
  it('seis serviços avulsos e nenhum combo', () => {
    expect(servicosAvulsos).toHaveLength(6)
    expect(combos).toHaveLength(0)
  })

  it('slugs únicos e no formato que o banco aceita', () => {
    const slugs = [...servicosAvulsos.map((s) => s.slug), ...barbeiros.map((b) => b.slug)]
    for (const slug of slugs) expect(slug, slug).toMatch(SLUG)
    expect(new Set(servicosAvulsos.map((s) => s.slug)).size).toBe(servicosAvulsos.length)
    expect(new Set(barbeiros.map((b) => b.slug)).size).toBe(barbeiros.length)
  })

  it('cada serviço está no seed com o mesmo nome, preço e duração', () => {
    for (const [i, s] of servicosAvulsos.entries()) {
      const linha = `('${s.slug}', 'avulso', '${s.nome}', '{}', ${s.precoCentavos}, ${s.duracaoMinutos}, ${i + 1}, true)`
      expect(seed, s.slug).toContain(linha)
    }
  })

  it('cada barbeiro está no seed com o mesmo nome e ordem', () => {
    for (const [i, b] of barbeiros.entries()) {
      expect(seed, b.slug).toContain(`('${b.slug}', '${b.nome}', '${b.especialidade}', ${i + 1}, true)`)
    }
  })

  it('duração múltipla da grade de 30 minutos e preço positivo', () => {
    for (const s of servicosAvulsos) {
      expect(s.duracaoMinutos % 30, s.slug).toBe(0)
      expect(s.precoCentavos, s.slug).toBeGreaterThan(0)
    }
  })
})

describe('funcionamento da Menezes', () => {
  it('cada dia aberto está no seed com abertura, fechamento e almoço iguais', () => {
    for (const faixa of horarioFuncionamento) {
      for (const dia of faixa.dias) {
        if (!faixa.abre || !faixa.fecha) {
          expect(seed, `dia ${dia} fechado não pode ter linha`).not.toMatch(new RegExp(String.raw`^\s*\(${dia}, '`, 'm'))
          continue
        }
        const almoco = faixa.almoco ? `'${faixa.almoco.inicio}', '${faixa.almoco.fim}'` : 'null, null'
        expect(seed, `dia ${dia}`).toContain(`(${dia}, '${faixa.abre}', '${faixa.fecha}', ${almoco})`)
      }
    }
  })

  it('o almoço fica dentro do expediente', () => {
    for (const faixa of horarioFuncionamento) {
      if (!faixa.almoco || !faixa.abre || !faixa.fecha) continue
      expect(faixa.abre <= faixa.almoco.inicio, faixa.rotulo).toBe(true)
      expect(faixa.almoco.inicio < faixa.almoco.fim, faixa.rotulo).toBe(true)
      expect(faixa.almoco.fim <= faixa.fecha, faixa.rotulo).toBe(true)
    }
  })

  it('todo dia da semana aparece uma vez', () => {
    const dias = horarioFuncionamento.flatMap((f) => f.dias).sort()
    expect(dias).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
