import { describe, it, expect } from 'vitest'
import { clienteAnon, temEnvAnon } from './clientes'

// QA S4: URB20 não consome a cota global (10 por minuto). Se consumisse, a 11ª chamada devolveria URB18.
const base = {
  p_servicos: ['sobrancelha'],
  p_barbeiro: null,
  p_inicio: '2030-01-01T13:00:00Z',
  p_nome: 'Teste Cota',
  p_telefone: '11955553333',
}

describe.skipIf(!temEnvAnon)('honeypot não gasta a cota global', () => {
  it('15 chamadas seguidas com website preenchido: todas URB20, nenhuma URB18', async () => {
    const anon = clienteAnon()
    const codigos: (string | undefined)[] = []
    for (let i = 0; i < 15; i++) {
      const { error } = await anon.rpc('criar_agendamento', { ...base, p_website: 'spam' })
      codigos.push(error?.code)
    }
    expect(codigos.every((c) => c === 'URB20')).toBe(true)
  })

  it('formato antigo de 5 argumentos nomeados ainda é aceito (default null): chega à validação do nome', async () => {
    const anon = clienteAnon()
    const { error } = await anon.rpc('criar_agendamento', { ...base, p_nome: 'X' })
    expect(error?.code).toBe('URB03') // não PGRST202
  })
})
