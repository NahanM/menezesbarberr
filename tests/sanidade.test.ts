import { describe, expect, it } from 'vitest'

// Teste de sanidade: prova que o Vitest está rodando. Os testes reais entram com as funções de src/lib.
describe('Vitest', () => {
  it('roda testes em tests/', () => {
    expect(1 + 1).toBe(2)
  })

  it('usa o fuso de São Paulo para formatar datas', () => {
    const texto = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date('2026-01-10T15:30:00Z'))
    expect(texto).toBe('12:30')
  })
})
