import { describe, expect, it } from 'vitest'
import { bloqueioDesatualizado, mensagemErroBloqueio, normalizarErroBloqueio } from '../../src/lib/painel/erroBloqueio'

describe('normalizarErroBloqueio', () => {
  it('códigos das funções do banco', () => {
    expect(normalizarErroBloqueio({ code: 'URB12', message: 'Período do bloqueio inválido' })).toBe('PERIODO')
    expect(normalizarErroBloqueio({ code: 'URB13' })).toBe('MOTIVO')
    expect(normalizarErroBloqueio({ code: 'URB14' })).toBe('BARBEIRO')
    expect(normalizarErroBloqueio({ code: 'URB15' })).toBe('NAO_ENCONTRADO')
  })
  it('42501: sem permissão', () => {
    expect(normalizarErroBloqueio({ code: '42501', message: 'Acesso negado.' })).toBe('SEM_PERMISSAO')
  })
  it('sessão vencida', () => {
    expect(normalizarErroBloqueio({ code: 'PGRST301', message: 'JWT expired' })).toBe('SESSAO')
    expect(normalizarErroBloqueio({ message: 'JWT expired' })).toBe('SESSAO')
  })
  it('rede: Chrome, Safari e Firefox', () => {
    expect(normalizarErroBloqueio(new TypeError('Failed to fetch'))).toBe('REDE')
    expect(normalizarErroBloqueio({ message: 'Load failed' })).toBe('REDE')
    expect(normalizarErroBloqueio({ message: 'NetworkError when attempting to fetch resource.' })).toBe('REDE')
  })
  it('códigos que são de agendamento (URB11, URB17, 23514) não valem aqui', () => {
    expect(normalizarErroBloqueio({ code: 'URB11' })).toBe('DESCONHECIDO')
    expect(normalizarErroBloqueio({ code: 'URB17' })).toBe('DESCONHECIDO')
    expect(normalizarErroBloqueio({ code: '23514' })).toBe('DESCONHECIDO')
  })
  it('qualquer outra coisa: desconhecido', () => {
    expect(normalizarErroBloqueio({ code: '500', message: 'boom' })).toBe('DESCONHECIDO')
    expect(normalizarErroBloqueio(null)).toBe('DESCONHECIDO')
    expect(normalizarErroBloqueio('texto')).toBe('DESCONHECIDO')
    expect(normalizarErroBloqueio(undefined)).toBe('DESCONHECIDO')
  })
})

describe('mensagemErroBloqueio', () => {
  const todos = ['PERIODO', 'MOTIVO', 'BARBEIRO', 'NAO_ENCONTRADO', 'SEM_PERMISSAO', 'SESSAO', 'REDE', 'DESCONHECIDO'] as const
  it('toda mensagem é em português, não vazia e sem texto técnico', () => {
    for (const c of todos) {
      const m = mensagemErroBloqueio(c)
      expect(m.length).toBeGreaterThan(10)
      expect(m).not.toMatch(/URB\d|42501|PGRST|JWT|undefined|null/)
    }
  })
  it('as mensagens são diferentes entre si', () => {
    expect(new Set(todos.map(mensagemErroBloqueio)).size).toBe(todos.length)
  })
  it('período inválido explica a regra', () => {
    expect(mensagemErroBloqueio('PERIODO')).toMatch(/fim precisa ser depois do início/)
  })
})

describe('bloqueioDesatualizado', () => {
  it('só "não encontrado" e "barbeiro inexistente" pedem nova busca', () => {
    expect(bloqueioDesatualizado('NAO_ENCONTRADO')).toBe(true)
    expect(bloqueioDesatualizado('BARBEIRO')).toBe(true)
    for (const c of ['PERIODO', 'MOTIVO', 'SEM_PERMISSAO', 'SESSAO', 'REDE', 'DESCONHECIDO'] as const) {
      expect(bloqueioDesatualizado(c)).toBe(false)
    }
  })
})
