import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contarAtendimentos, ehDiaValido, type Agendamento, type Bloqueio } from '../../src/lib/painel/agenda'
import {
  diasDaSemana,
  inicioDaSemana,
  periodoDaSemana,
  resumirPeriodo,
  resumirSemana,
  rotuloSemana,
} from '../../src/lib/painel/semana'

// Referências de calendário (2026): 05/10 segunda, 09/10 sexta, 10/10 sábado, 11/10 domingo.
// Funcionamento (data/barbearia.ts): segunda e domingo fechados; terça a sábado abertos.

let n = 0
function ag(inicio: string, status: Agendamento['status'] = 'confirmado', extra: Partial<Agendamento> = {}): Agendamento {
  n++
  return {
    id: `s-${n}`,
    codigo: `C${n}`,
    status,
    inicio,
    fim: inicio, // o resumo só olha o início
    barbeiroId: 'b1',
    barbeiroNome: 'Rafael',
    servicoNome: 'Corte',
    servicoTipo: 'avulso',
    clienteNome: 'Fulano',
    clienteTelefone: '11999990000',
    ...extra,
  }
}

function bloq(inicio: string, fim: string, extra: Partial<Bloqueio> = {}): Bloqueio {
  n++
  return { id: `k-${n}`, barbeiroId: 'b1', barbeiroNome: 'Rafael', inicio, fim, motivo: 'Folga', ...extra }
}

const BARBEIROS = [
  { id: 'b1', nome: 'Rafael' },
  { id: 'b2', nome: 'Diego' },
  { id: 'b3', nome: 'Caio' },
]

describe('inicioDaSemana (segunda a domingo)', () => {
  it('qualquer dia volta para a segunda da mesma semana', () => {
    for (const dia of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
      expect(inicioDaSemana(dia)).toBe('2026-10-05')
    }
  })
  it('domingo pertence à semana que termina nele, não à seguinte', () => {
    expect(inicioDaSemana('2026-10-11')).toBe('2026-10-05')
    expect(inicioDaSemana('2026-10-12')).toBe('2026-10-12')
  })
  it('virada de mês e de ano', () => {
    expect(inicioDaSemana('2026-11-01')).toBe('2026-10-26') // domingo
    expect(inicioDaSemana('2027-01-01')).toBe('2026-12-28') // sexta
    expect(inicioDaSemana('2026-01-01')).toBe('2025-12-29') // quinta
  })
  it('ano bissexto', () => {
    expect(inicioDaSemana('2028-03-01')).toBe('2028-02-28') // quarta; 2028-02-29 existe
    expect(diasDaSemana('2028-03-01')).toContain('2028-02-29')
  })
})

describe('diasDaSemana e periodoDaSemana', () => {
  it('sete dias seguidos de segunda a domingo', () => {
    expect(diasDaSemana('2026-10-09')).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ])
    expect(periodoDaSemana('2026-10-09')).toEqual({ de: '2026-10-05', ate: '2026-10-11' })
  })
  it('semana na virada de ano cruza o 31/12', () => {
    expect(diasDaSemana('2026-12-31')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
    expect(periodoDaSemana('2026-12-31')).toEqual({ de: '2026-12-28', ate: '2027-01-03' })
  })
  it('nas pontas do calendário omite dias que o painel não aceita', () => {
    const fim = diasDaSemana('9999-12-31')
    expect(fim.length).toBeLessThan(7)
    expect(fim.every(ehDiaValido)).toBe(true)
    expect(periodoDaSemana('9999-12-31').ate).toBe('9999-12-31')
    const inicio = diasDaSemana('0100-01-01')
    expect(inicio.length).toBeGreaterThan(0)
    expect(inicio.every(ehDiaValido)).toBe(true)
  })
})

describe('rótulos', () => {
  it('semana "06/10 – 12/10"', () => {
    expect(rotuloSemana('2026-10-08')).toBe('05/10 – 11/10')
    expect(rotuloSemana('2026-10-12')).toBe('12/10 – 18/10')
  })
  it('semana na virada do ano', () => {
    expect(rotuloSemana('2027-01-02')).toBe('28/12 – 03/01')
  })
})

// O dia de cada atendimento é o de São Paulo, qualquer que seja o fuso do computador.
describe.each(['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo'])('resumirSemana com TZ=%s', (tz) => {
  const original = process.env.TZ
  beforeEach(() => {
    process.env.TZ = tz
  })
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  const dias = diasDaSemana('2026-10-07')

  it('atendimento às 23:30 em SP fica no próprio dia, mesmo sendo o dia seguinte em UTC', () => {
    const r = resumirSemana(dias, BARBEIROS, [ag('2026-10-07T23:30:00-03:00')], [])
    expect(r.find((d) => d.dia === '2026-10-07')?.total).toBe(1)
    expect(r.find((d) => d.dia === '2026-10-08')?.total).toBe(0)
  })

  it('atendimento às 00:10 em SP fica no dia novo, mesmo sendo o dia anterior em Los Angeles', () => {
    const r = resumirSemana(dias, BARBEIROS, [ag('2026-10-08T00:10:00-03:00')], [])
    expect(r.find((d) => d.dia === '2026-10-07')?.total).toBe(0)
    expect(r.find((d) => d.dia === '2026-10-08')?.total).toBe(1)
  })

  it('virada de ano: 31/12 às 22:00 em SP é 01/01 em UTC e continua no dia 31', () => {
    const semana = diasDaSemana('2026-12-31')
    const r = resumirSemana(semana, BARBEIROS, [ag('2026-12-31T22:00:00-03:00'), ag('2027-01-01T01:00:00-03:00')], [])
    expect(r.map((d) => [d.dia, d.total]).filter(([, t]) => t !== 0)).toEqual([
      ['2026-12-31', 1],
      ['2027-01-01', 1],
    ])
  })
})

describe('resumirSemana', () => {
  const dias = diasDaSemana('2026-10-07') // 05/10 a 11/10

  it('devolve um resumo por dia, na ordem, mesmo sem dados', () => {
    const r = resumirSemana(dias, BARBEIROS, [], [])
    expect(r.map((d) => d.dia)).toEqual(dias)
    expect(r.every((d) => d.total === 0 && d.pendentes === 0 && d.porBarbeiro.length === 0 && d.bloqueios.length === 0)).toBe(true)
  })

  it('marca como fechado o que o horário de funcionamento diz (segunda e domingo)', () => {
    const r = resumirSemana(dias, BARBEIROS, [], [])
    expect(r.map((d) => d.fechado)).toEqual([true, false, false, false, false, false, true])
  })

  it('total conta tudo menos cancelado e não compareceu; pendentes são só os pendentes', () => {
    const r = resumirSemana(
      dias,
      BARBEIROS,
      [
        ag('2026-10-07T09:00:00-03:00', 'pendente'),
        ag('2026-10-07T10:00:00-03:00', 'pendente'),
        ag('2026-10-07T11:00:00-03:00', 'confirmado'),
        ag('2026-10-07T12:00:00-03:00', 'concluido'),
        ag('2026-10-07T13:00:00-03:00', 'nao_compareceu'),
        ag('2026-10-07T14:00:00-03:00', 'cancelado'),
      ],
      [],
    )
    const quarta = r.find((d) => d.dia === '2026-10-07')!
    expect(quarta.total).toBe(4) // cancelado e não compareceu ficam fora
    expect(quarta.pendentes).toBe(2)
  })

  it('só cancelados: dia sem atendimento', () => {
    const r = resumirSemana(dias, BARBEIROS, [ag('2026-10-07T14:00:00-03:00', 'cancelado')], [])
    expect(r.find((d) => d.dia === '2026-10-07')).toMatchObject({ total: 0, pendentes: 0, porBarbeiro: [] })
  })

  it('resumo por barbeiro: só quem atende no dia, na ordem dos barbeiros, com a quantidade', () => {
    const r = resumirSemana(
      dias,
      BARBEIROS,
      [
        ag('2026-10-07T09:00:00-03:00', 'confirmado', { barbeiroId: 'b2', barbeiroNome: 'Diego' }),
        ag('2026-10-07T10:00:00-03:00', 'pendente', { barbeiroId: 'b2', barbeiroNome: 'Diego' }),
        ag('2026-10-07T11:00:00-03:00', 'confirmado', { barbeiroId: 'b1', barbeiroNome: 'Rafael' }),
        ag('2026-10-07T12:00:00-03:00', 'cancelado', { barbeiroId: 'b3', barbeiroNome: 'Caio' }),
      ],
      [],
    )
    expect(r.find((d) => d.dia === '2026-10-07')?.porBarbeiro).toEqual([
      { barbeiroId: 'b1', nome: 'Rafael', quantidade: 1 },
      { barbeiroId: 'b2', nome: 'Diego', quantidade: 2 },
    ])
  })

  it('barbeiro desativado com atendimento no dia continua aparecendo, no fim', () => {
    const r = resumirSemana(
      dias,
      BARBEIROS,
      [ag('2026-10-07T09:00:00-03:00', 'concluido', { barbeiroId: 'b9', barbeiroNome: 'Marcos' })],
      [],
    )
    expect(r.find((d) => d.dia === '2026-10-07')?.porBarbeiro).toEqual([{ barbeiroId: 'b9', nome: 'Marcos', quantidade: 1 }])
  })

  it('atendimento fora dos 7 dias é ignorado', () => {
    const r = resumirSemana(dias, BARBEIROS, [ag('2026-10-04T10:00:00-03:00'), ag('2026-10-12T10:00:00-03:00')], [])
    expect(r.reduce((soma, d) => soma + d.total, 0)).toBe(0)
  })

  it('dia fechado com atendimento marcado mostra os números (nada some)', () => {
    const r = resumirSemana(dias, BARBEIROS, [ag('2026-10-05T10:00:00-03:00')], [])
    expect(r[0]).toMatchObject({ dia: '2026-10-05', fechado: true, total: 1 })
  })

  it('bloqueio entra em todos os dias que toca, inclusive os de vários dias', () => {
    const folga = bloq('2026-10-07T20:00:00-03:00', '2026-10-09T09:00:00-03:00')
    const r = resumirSemana(dias, BARBEIROS, [], [folga])
    expect(r.filter((d) => d.bloqueios.length > 0).map((d) => d.dia)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
  })

  it('bloqueio que termina à meia-noite não encosta no dia seguinte', () => {
    const k = bloq('2026-10-07T18:00:00-03:00', '2026-10-08T00:00:00-03:00')
    const r = resumirSemana(dias, BARBEIROS, [], [k])
    expect(r.filter((d) => d.bloqueios.length > 0).map((d) => d.dia)).toEqual(['2026-10-07'])
  })

  it('bloqueio da barbearia inteira conta para o dia', () => {
    const k = bloq('2026-10-08T12:00:00-03:00', '2026-10-08T13:00:00-03:00', { barbeiroId: null, barbeiroNome: null })
    const r = resumirSemana(dias, BARBEIROS, [], [k])
    expect(r.find((d) => d.dia === '2026-10-08')?.bloqueios).toEqual([k])
  })

  it('bloqueio fora da semana é ignorado', () => {
    const k = bloq('2026-10-20T12:00:00-03:00', '2026-10-20T13:00:00-03:00')
    expect(resumirSemana(dias, BARBEIROS, [], [k]).every((d) => d.bloqueios.length === 0)).toBe(true)
  })
})

describe('contarAtendimentos e resumirPeriodo (resumo do topo do painel)', () => {
  it('cancelado e não compareceu ficam fora de tudo; concluído conta; confirmado e pendente são contados à parte', () => {
    const c = contarAtendimentos([
      ag('2026-10-07T10:00:00-03:00', 'pendente'),
      ag('2026-10-07T11:00:00-03:00', 'confirmado'),
      ag('2026-10-07T12:00:00-03:00', 'concluido'),
      ag('2026-10-07T13:00:00-03:00', 'nao_compareceu'),
      ag('2026-10-07T14:00:00-03:00', 'cancelado'),
    ])
    expect(c).toMatchObject({ agendados: 3, pendentes: 1, confirmados: 1 })
  })

  it('lista vazia: tudo zero e nenhum primeiro pendente', () => {
    expect(contarAtendimentos([])).toEqual({ agendados: 0, pendentes: 0, confirmados: 0, primeiroPendenteId: null })
  })

  it('o primeiro pendente é o que começa mais cedo, mesmo vindo fora de ordem e de outro barbeiro', () => {
    const tarde = ag('2026-10-07T15:00:00-03:00', 'pendente', { barbeiroId: 'b1' })
    const cedo = ag('2026-10-07T09:00:00-03:00', 'pendente', { barbeiroId: 'b2' })
    const cancelado = ag('2026-10-07T08:00:00-03:00', 'cancelado')
    expect(contarAtendimentos([tarde, cancelado, cedo]).primeiroPendenteId).toBe(cedo.id)
  })

  it('a semana soma os dias e aponta o primeiro dia com pendente', () => {
    const dias = diasDaSemana('2026-10-07')
    const r = resumirSemana(
      dias,
      BARBEIROS,
      [
        ag('2026-10-07T10:00:00-03:00', 'confirmado'),
        ag('2026-10-08T10:00:00-03:00', 'pendente'),
        ag('2026-10-09T10:00:00-03:00', 'pendente'),
        ag('2026-10-09T11:00:00-03:00', 'cancelado'),
      ],
      [],
    )
    expect(resumirPeriodo(r)).toEqual({ agendados: 3, pendentes: 2, confirmados: 1, primeiroDiaComPendente: '2026-10-08' })
  })

  it('semana sem pendentes: nenhum dia para o atalho', () => {
    const r = resumirSemana(diasDaSemana('2026-10-07'), BARBEIROS, [ag('2026-10-07T10:00:00-03:00', 'confirmado')], [])
    expect(resumirPeriodo(r).primeiroDiaComPendente).toBeNull()
  })
})

describe('resumo: faltas ficam fora do total, dos cartões e do resumo', () => {
  it('a soma dos cartões é igual ao resumo da semana, e a falta não conta em nenhum', () => {
    const r = resumirSemana(
      diasDaSemana('2026-10-07'),
      BARBEIROS,
      [ag('2026-10-07T10:00:00-03:00', 'concluido'), ag('2026-10-07T11:00:00-03:00', 'nao_compareceu')],
      [],
    )
    const quarta = r.find((d) => d.dia === '2026-10-07')
    expect(quarta).toMatchObject({ total: 1 })
    expect(quarta?.porBarbeiro).toEqual([{ barbeiroId: 'b1', nome: 'Rafael', quantidade: 1 }])
    expect(resumirPeriodo(r).agendados).toBe(1)
    expect(r.reduce((soma, d) => soma + d.total, 0)).toBe(resumirPeriodo(r).agendados)
  })
})
