import { describe, it, expect } from 'vitest'
import { clienteAnon, temEnvAnon } from './clientes'

// Honeypot (migration 20261024140000): o campo invisível "website" do formulário.
// Preenchido: criar_agendamento recusa com URB20 antes de qualquer outra checagem.
// Vazio, só espaços ou ausente: o fluxo segue normal.
//
// Poupa a cota global (10 por minuto): todos os casos aqui falham ANTES de gravar. O que recusa por
// URB20 nem chega ao limite; os que "seguem" usam um nome inválido de propósito (URB03) para provar
// que passaram do honeypot sem criar linha.

const base = {
  p_servicos: ['sobrancelha'],
  p_barbeiro: null,
  p_inicio: '2030-01-01T13:00:00Z',
  p_nome: 'Teste Honeypot',
  p_telefone: '11955554444',
}
// Nome com 1 letra: o servidor recusa com URB03, sem gravar e sem olhar o limite.
const nomeInvalido = { ...base, p_nome: 'X' }

describe.skipIf(!temEnvAnon)('honeypot (website) em criar_agendamento', () => {
  const anon = clienteAnon()

  it('preenchido: recusa com URB20 e devolve nada', async () => {
    const { data, error } = await anon.rpc('criar_agendamento', { ...base, p_website: 'http://spam.example' })
    expect(error?.code).toBe('URB20')
    expect(error?.message).not.toMatch(/honeypot|website|robô|bot/i)
    expect(data).toBeNull()
  })

  it('preenchido vem ANTES das outras validações (nome inválido não aparece)', async () => {
    const { error } = await anon.rpc('criar_agendamento', { ...nomeInvalido, p_website: 'x' })
    expect(error?.code).toBe('URB20')
  })

  it('preenchido com espaços em volta ainda é robô; só espaços e controle não é', async () => {
    const preenchido = await anon.rpc('criar_agendamento', { ...nomeInvalido, p_website: '   x \t' })
    expect(preenchido.error?.code).toBe('URB20')
    for (const vazio of ['', '   ', '\t\n ']) {
      const { error } = await anon.rpc('criar_agendamento', { ...nomeInvalido, p_website: vazio })
      expect(error?.code, `valor ${JSON.stringify(vazio)}`).toBe('URB03')
    }
  })

  it('ausente ou null: segue o fluxo normal (a validação do nome responde)', async () => {
    const ausente = await anon.rpc('criar_agendamento', nomeInvalido)
    expect(ausente.error?.code).toBe('URB03')
    const nulo = await anon.rpc('criar_agendamento', { ...nomeInvalido, p_website: null })
    expect(nulo.error?.code).toBe('URB03')
  })
})
