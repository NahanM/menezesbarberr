import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, expect, it } from 'vitest'
import { ehDiaValido, type Agendamento, type Bloqueio } from '../../src/lib/painel/agenda'
import { diasDaSemana, periodoDaSemana, resumirSemana, rotuloSemana } from '../../src/lib/painel/semana'

// QA do 4.3: bordas de calendário e de fuso que o spec do dev não cobre.
// 2026: 28/12 segunda ... 03/01/2027 domingo; 26/10 segunda ... 01/11 domingo; 02/11 segunda ... 08/11 domingo.

let n = 0
function ag(inicio: string, status: Agendamento['status'] = 'confirmado', barbeiroId = 'b1'): Agendamento {
  n++
  return {
    id: `q-${n}`, codigo: `Q${n}`, status, inicio, fim: inicio, barbeiroId,
    barbeiroNome: barbeiroId, servicoNome: 'Corte', servicoTipo: 'avulso', clienteNome: 'X', clienteTelefone: '11999990000',
  }
}
function bloq(inicio: string, fim: string, barbeiroId: string | null = 'b1'): Bloqueio {
  n++
  return { id: `k-${n}`, barbeiroId, barbeiroNome: barbeiroId, inicio, fim, motivo: 'Folga' }
}
const B = [{ id: 'b1', nome: 'Rafael' }, { id: 'b2', nome: 'Diego' }]

describe('semana na virada de ano', () => {
  const dias = diasDaSemana('2027-01-01')
  it('28/12 a 03/01, 7 dias, em ordem', () => {
    expect(dias).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(rotuloSemana('2027-01-01')).toBe('28/12 – 03/01')
  })
  it('23:30 de 31/12 em SP fica em 31/12 e 00:00 de 01/01 em 01/01 (apesar do UTC)', () => {
    const r = resumirSemana(dias, B, [ag('2026-12-31T23:30:00-03:00'), ag('2027-01-01T00:00:00-03:00'), ag('2027-01-01T02:59:59Z')], [])
    expect(r.find((d) => d.dia === '2026-12-31')!.total).toBe(2) // 02:59:59Z de 01/01 = 23:59:59 de 31/12 em SP
    expect(r.find((d) => d.dia === '2027-01-01')!.total).toBe(1)
  })
})

describe('domingo 23:30 e segunda 00:00 em São Paulo', () => {
  const dias = diasDaSemana('2026-11-04')
  it('domingo 23:30 SP (02:30Z de segunda) pertence ao domingo da semana', () => {
    const r = resumirSemana(dias, B, [ag('2026-11-09T02:30:00Z')], [])
    expect(r[6].dia).toBe('2026-11-08')
    expect(r[6].total).toBe(1)
    expect(r.reduce((s, d) => s + d.total, 0)).toBe(1)
  })
  it('segunda 00:00 SP (03:00Z) já é a semana seguinte: não entra nesta', () => {
    const r = resumirSemana(dias, B, [ag('2026-11-09T03:00:00Z')], [])
    expect(r.reduce((s, d) => s + d.total, 0)).toBe(0)
  })
  it('segunda 00:00 SP é o primeiro instante da semana (dia 02/11)', () => {
    const r = resumirSemana(dias, B, [ag('2026-11-02T03:00:00Z'), ag('2026-11-02T02:59:59Z')], [])
    expect(r[0].total).toBe(1) // 02:59:59Z ainda é domingo 01/11 em SP: fora da semana
  })
})

describe('bloqueios nas bordas do dia', () => {
  const dias = diasDaSemana('2026-11-04')
  it('bloqueio que termina exatamente à meia-noite não toca o dia seguinte', () => {
    const r = resumirSemana(dias, B, [], [bloq('2026-11-03T20:00:00-03:00', '2026-11-04T00:00:00-03:00')])
    expect(r.find((d) => d.dia === '2026-11-03')!.bloqueios).toHaveLength(1)
    expect(r.find((d) => d.dia === '2026-11-04')!.bloqueios).toHaveLength(0)
  })
  it('bloqueio que começa à meia-noite toca só o dia que começa', () => {
    const r = resumirSemana(dias, B, [], [bloq('2026-11-04T00:00:00-03:00', '2026-11-04T08:00:00-03:00')])
    expect(r.filter((d) => d.bloqueios.length > 0).map((d) => d.dia)).toEqual(['2026-11-04'])
  })
  it('bloqueio de 14 dias que cobre a semana toda aparece nos 7 dias, uma vez em cada', () => {
    const r = resumirSemana(dias, B, [], [bloq('2026-10-30T09:00:00-03:00', '2026-11-12T09:00:00-03:00', null)])
    expect(r.map((d) => d.bloqueios.length)).toEqual([1, 1, 1, 1, 1, 1, 1])
  })
})

describe('dia fechado com agendamento', () => {
  it('domingo e segunda (fechados) continuam contando o que existe', () => {
    const dias = diasDaSemana('2026-11-04')
    const r = resumirSemana(dias, B, [ag('2026-11-02T10:00:00-03:00', 'pendente'), ag('2026-11-08T10:00:00-03:00')], [])
    expect(r[0]).toMatchObject({ fechado: true, total: 1, pendentes: 1 })
    expect(r[6]).toMatchObject({ fechado: true, total: 1, pendentes: 0 })
  })
})

describe('contagem por status', () => {
  const dias = diasDaSemana('2026-11-04')
  it('só cancelado: total 0, pendentes 0, sem barbeiro no resumo', () => {
    const r = resumirSemana(dias, B, [ag('2026-11-04T10:00:00-03:00', 'cancelado')], [])
    expect(r[2]).toMatchObject({ total: 0, pendentes: 0, porBarbeiro: [] })
  })
  it('concluido conta; nao_compareceu e cancelado ficam fora; so pendente conta como pendente', () => {
    const r = resumirSemana(
      dias, B,
      ['nao_compareceu', 'concluido', 'confirmado', 'pendente'].map((s) => ag('2026-11-04T10:00:00-03:00', s as Agendamento['status'])),
      [],
    )
    expect(r[2]).toMatchObject({ total: 3, pendentes: 1 })
    expect(r[2].porBarbeiro).toEqual([{ barbeiroId: 'b1', nome: 'Rafael', quantidade: 3 }])
  })
  it('soma por barbeiro == total do dia', () => {
    const r = resumirSemana(dias, B, [ag('2026-11-04T10:00:00-03:00'), ag('2026-11-04T11:00:00-03:00', 'pendente', 'b2'), ag('2026-11-04T12:00:00-03:00', 'confirmado', 'fantasma')], [])
    expect(r[2].porBarbeiro.reduce((s, b) => s + b.quantidade, 0)).toBe(r[2].total)
  })
  it('sem barbeiros cadastrados e com agendamento: não perde o atendimento', () => {
    const r = resumirSemana(dias, [], [ag('2026-11-04T10:00:00-03:00')], [])
    expect(r[2].total).toBe(1)
  })
})

describe('pontas do calendário', () => {
  it('semana do dia 0100-01-01 nunca devolve dia inválido nem lança', () => {
    const d = diasDaSemana('0100-01-01')
    expect(d.length).toBeGreaterThan(0)
    expect(d.every(ehDiaValido)).toBe(true)
    expect(() => periodoDaSemana('0100-01-01')).not.toThrow()
  })
  it('semana de 9999-12-31 tem 5 dias e o período termina em 9999-12-31', () => {
    expect(periodoDaSemana('9999-12-31')).toEqual({ de: '9999-12-27', ate: '9999-12-31' })
  })
  it('período de qualquer semana cabe no limite de 31 dias do servidor', () => {
    for (const dia of ['2026-02-28', '2028-02-29', '2026-12-31', '2026-03-29']) {
      const { de, ate } = periodoDaSemana(dia)
      expect((Date.parse(ate) - Date.parse(de)) / 86400000).toBe(6)
    }
  })
  it('semanas em torno do fim do horário de verão/mudança de fuso mantêm 7 dias distintos', () => {
    for (const dia of ['2026-10-25', '2026-03-08', '2026-11-01', '2018-11-04', '2019-02-17']) {
      const d = diasDaSemana(dia)
      expect(new Set(d).size).toBe(7)
    }
  })
})
