import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, expect, it } from 'vitest'
import {
  BARBEARIA_TODA,
  MOTIVO_MAX,
  MOTIVOS_RAPIDOS,
  avisoBloqueioCriado,
  instanteEmSP,
  janelaDoDia,
  limparMotivo,
  montarPedido,
  periodoDoBloqueio,
  validarBloqueio,
  type FormBloqueio,
} from '../../src/lib/painel/bloqueio'

// "Agora" fixo: quinta 15/10/2026, 12:00 em São Paulo (= 15:00Z).
const AGORA = Date.parse('2026-10-15T15:00:00Z')

const valido: FormBloqueio = { barbeiro: 'b1', dia: '2026-10-16', inicio: '09:00', fim: '12:00', motivo: 'Folga' }
const com = (parcial: Partial<FormBloqueio>): FormBloqueio => ({ ...valido, ...parcial })

describe('instanteEmSP: dia + hora de São Paulo viram timestamptz', () => {
  it('hoje São Paulo é UTC-3: 09:30 vira 12:30Z', () => {
    expect(instanteEmSP('2026-10-15', '09:30')).toBe('2026-10-15T12:30:00.000Z')
  })
  it('meia-noite local é 03:00Z do mesmo dia', () => {
    expect(instanteEmSP('2026-10-15', '00:00')).toBe('2026-10-15T03:00:00.000Z')
  })
  it('23:59 local já é o dia seguinte em UTC', () => {
    expect(instanteEmSP('2026-10-15', '23:59')).toBe('2026-10-16T02:59:00.000Z')
  })
  it('virada de ano e dia 29/02', () => {
    expect(instanteEmSP('2026-12-31', '22:00')).toBe('2027-01-01T01:00:00.000Z')
    expect(instanteEmSP('2028-02-29', '10:00')).toBe('2028-02-29T13:00:00.000Z')
  })
  it('usa o fuso de verdade, não um -03:00 fixo: em dez/2018 havia horário de verão (UTC-2)', () => {
    expect(instanteEmSP('2018-12-01', '09:00')).toBe('2018-12-01T11:00:00.000Z')
    expect(instanteEmSP('2019-07-01', '09:00')).toBe('2019-07-01T12:00:00.000Z')
  })
  it('periodoDoBloqueio devolve início e fim', () => {
    expect(periodoDoBloqueio('2026-10-15', '09:00', '12:30')).toEqual({
      inicio: '2026-10-15T12:00:00.000Z',
      fim: '2026-10-15T15:30:00.000Z',
    })
  })
})

describe('validarBloqueio', () => {
  it('formulário completo e no futuro: sem erros', () => {
    expect(validarBloqueio(valido, AGORA)).toEqual({})
  })
  it('motivo é opcional; "Barbearia toda" vale como escolha', () => {
    expect(validarBloqueio(com({ motivo: '', barbeiro: BARBEARIA_TODA }), AGORA)).toEqual({})
  })
  it('campos vazios: um erro por campo obrigatório, em português', () => {
    const erros = validarBloqueio({ barbeiro: '', dia: '', inicio: '', fim: '', motivo: '' }, AGORA)
    expect(Object.keys(erros).sort()).toEqual(['barbeiro', 'dia', 'fim', 'inicio'])
    expect(erros.barbeiro).toMatch(/barbeiro/i)
    expect(erros.inicio).toBe('Informe a hora de início.')
    expect(erros.fim).toBe('Informe a hora de fim.')
  })
  it('fim igual ou antes do início: erro no fim', () => {
    expect(validarBloqueio(com({ inicio: '10:00', fim: '10:00' }), AGORA).fim).toBe('O fim precisa ser depois do início.')
    expect(validarBloqueio(com({ inicio: '10:00', fim: '09:59' }), AGORA).fim).toBe('O fim precisa ser depois do início.')
    expect(validarBloqueio(com({ inicio: '10:00', fim: '10:15' }), AGORA)).toEqual({})
  })
  it('hora fora do formato é recusada', () => {
    expect(validarBloqueio(com({ inicio: '25:00' }), AGORA).inicio).toMatch(/inválida/)
    expect(validarBloqueio(com({ fim: '9:5' }), AGORA).fim).toMatch(/inválida/)
  })
  it('dia inexistente ou fora do padrão', () => {
    expect(validarBloqueio(com({ dia: '2026-02-30' }), AGORA).dia).toMatch(/não existe/)
    expect(validarBloqueio(com({ dia: '16/10/2026' }), AGORA).dia).toMatch(/não existe/)
  })
  it('fim que já passou: erro no fim; fim que ainda vem hoje passa', () => {
    expect(validarBloqueio(com({ dia: '2026-10-15', inicio: '08:00', fim: '11:00' }), AGORA).fim).toMatch(/já passou/)
    expect(validarBloqueio(com({ dia: '2026-10-15', inicio: '08:00', fim: '12:00' }), AGORA).fim).toMatch(/já passou/)
    expect(validarBloqueio(com({ dia: '2026-10-15', inicio: '08:00', fim: '12:15' }), AGORA)).toEqual({})
    expect(validarBloqueio(com({ dia: '2026-10-14' }), AGORA).fim).toMatch(/já passou/)
  })
  it('o "já passou" usa o relógio de São Paulo: 23:30Z de 15/10 ainda é 20:30 do dia 15 em SP', () => {
    const tarde = Date.parse('2026-10-15T23:30:00Z')
    expect(validarBloqueio(com({ dia: '2026-10-15', inicio: '19:00', fim: '20:00' }), tarde).fim).toMatch(/já passou/)
    expect(validarBloqueio(com({ dia: '2026-10-15', inicio: '19:00', fim: '21:00' }), tarde)).toEqual({})
  })
  it('motivo: o limite é o do servidor (120 depois de limpar espaços)', () => {
    expect(MOTIVO_MAX).toBe(120)
    expect(validarBloqueio(com({ motivo: 'a'.repeat(120) }), AGORA)).toEqual({})
    expect(validarBloqueio(com({ motivo: 'a'.repeat(121) }), AGORA).motivo).toMatch(/120/)
    // Espaços repetidos contam como um só, como no banco.
    expect(validarBloqueio(com({ motivo: `${'a'.repeat(119)}      ` }), AGORA)).toEqual({})
  })
})

describe('montarPedido', () => {
  it('barbeiro específico: manda o id e o período em UTC', () => {
    expect(montarPedido(valido)).toEqual({
      barbeiroId: 'b1',
      inicio: '2026-10-16T12:00:00.000Z',
      fim: '2026-10-16T15:00:00.000Z',
      motivo: 'Folga',
    })
  })
  it('"Barbearia toda" vira barbeiro nulo', () => {
    expect(montarPedido(com({ barbeiro: BARBEARIA_TODA })).barbeiroId).toBeNull()
  })
  it('motivo sai limpo (espaços repetidos e pontas)', () => {
    expect(montarPedido(com({ motivo: '  Almoço   estendido \n' })).motivo).toBe('Almoço estendido')
  })
})

describe('limparMotivo e sugestões', () => {
  it('colapsa espaços e quebras', () => {
    expect(limparMotivo('  a \t b\n\nc ')).toBe('a b c')
  })
  it('as 3 sugestões pedidas', () => {
    expect([...MOTIVOS_RAPIDOS]).toEqual(['Folga', 'Compromisso', 'Almoço estendido'])
  })
})

describe('janelaDoDia ("Dia inteiro")', () => {
  it('dia aberto: da abertura ao fechamento', () => {
    expect(janelaDoDia('2026-10-16')).toEqual({ inicio: '09:00', fim: '20:00' }) // sexta
    expect(janelaDoDia('2026-10-17')).toEqual({ inicio: '09:00', fim: '18:00' }) // sábado
  })
  it('dia fechado: o dia todo', () => {
    expect(janelaDoDia('2026-10-19')).toEqual({ inicio: '00:00', fim: '23:59' }) // segunda
  })
})

describe('avisoBloqueioCriado', () => {
  const base = { barbeiroNome: 'Rafael', inicio: '2026-10-16T12:00:00.000Z', fim: '2026-10-16T15:00:00.000Z' }
  it('sem conflito: só diz o que foi criado (hora de SP)', () => {
    expect(avisoBloqueioCriado({ ...base, conflitos: 0 })).toBe('Bloqueio criado: Rafael, sexta, 16/10, 09:00 – 12:00.')
  })
  it('barbeiro nulo vira "Barbearia toda"', () => {
    expect(avisoBloqueioCriado({ ...base, barbeiroNome: null, conflitos: 0 })).toContain('Barbearia toda')
  })
  it('com agendamentos dentro: avisa que continuam na agenda (singular e plural)', () => {
    const um = avisoBloqueioCriado({ ...base, conflitos: 1 })
    expect(um).toContain('Atenção: 1 agendamento já estava marcado')
    expect(um).toContain('continua na agenda')
    const dois = avisoBloqueioCriado({ ...base, conflitos: 2 })
    expect(dois).toContain('2 agendamentos já estavam marcados')
    expect(dois).toContain('continuam na agenda')
  })
})
