import { describe, it, expect } from 'vitest'
import { agendaDesatualizada, mensagemErroStatus, normalizarErroStatus } from '../../src/lib/painel/erroStatus'

describe('normalizarErroStatus', () => {
  it('trigger de transição: código 23514 ou texto do banco', () => {
    expect(normalizarErroStatus({ code: '23514', message: 'x' })).toBe('TRANSICAO')
    expect(normalizarErroStatus({ code: '', message: 'Transição de status inválida: concluido -> pendente' })).toBe('TRANSICAO')
  })
  it('URB17: atendimento ainda não começou', () => {
    expect(normalizarErroStatus({ code: 'URB17', message: 'O atendimento ainda não começou.' })).toBe('AINDA_NAO_COMECOU')
  })
  it('42501: sem permissão', () => {
    expect(normalizarErroStatus({ code: '42501', message: 'Acesso negado.' })).toBe('SEM_PERMISSAO')
  })
  it('URB11: agendamento não encontrado', () => {
    expect(normalizarErroStatus({ code: 'URB11' })).toBe('NAO_ENCONTRADO')
  })
  it('sessão vencida', () => {
    expect(normalizarErroStatus({ code: 'PGRST301', message: 'JWT expired' })).toBe('SESSAO')
    expect(normalizarErroStatus({ message: 'JWT expired' })).toBe('SESSAO')
  })
  it('rede: Chrome, Safari e Firefox', () => {
    expect(normalizarErroStatus({ message: 'TypeError: Failed to fetch' })).toBe('REDE')
    expect(normalizarErroStatus({ message: 'Load failed' })).toBe('REDE')
    expect(normalizarErroStatus({ message: 'NetworkError when attempting to fetch resource.' })).toBe('REDE')
    expect(normalizarErroStatus(new TypeError('Failed to fetch'))).toBe('REDE')
  })
  it('qualquer outra coisa: desconhecido', () => {
    expect(normalizarErroStatus({ code: '500', message: 'boom' })).toBe('DESCONHECIDO')
    expect(normalizarErroStatus(null)).toBe('DESCONHECIDO')
    expect(normalizarErroStatus('texto')).toBe('DESCONHECIDO')
    expect(normalizarErroStatus(undefined)).toBe('DESCONHECIDO')
  })
})

describe('mensagemErroStatus', () => {
  it('toda mensagem é em português, não vazia e sem vazar texto técnico', () => {
    for (const c of ['TRANSICAO', 'EXPIRADO', 'AINDA_NAO_COMECOU', 'SEM_PERMISSAO', 'NAO_ENCONTRADO', 'SESSAO', 'REDE', 'DESCONHECIDO'] as const) {
      const m = mensagemErroStatus(c)
      expect(m.length).toBeGreaterThan(10)
      expect(m).not.toMatch(/23514|42501|URB\d|JWT|fetch/i)
    }
  })
  it('só transição inválida, expirado e não encontrado pedem rebuscar a agenda', () => {
    expect(agendaDesatualizada('TRANSICAO')).toBe(true)
    expect(agendaDesatualizada('EXPIRADO')).toBe(true)
    expect(agendaDesatualizada('NAO_ENCONTRADO')).toBe(true)
    expect(agendaDesatualizada('REDE')).toBe(false)
    expect(agendaDesatualizada('SEM_PERMISSAO')).toBe(false)
  })
})
