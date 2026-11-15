// Limite global de criações (S3): ninguém de fora consegue trocar o limite nem o relógio.
//   * _criar_agendamento (o corpo, que recebe limites e "agora") não tem grant: nem anon nem equipe.
//   * teste_criar_agendamento é só da equipe e só aceita nome com prefixo "Teste".
//   * criar_agendamento pública tem 5 parâmetros: mandar limite, relógio ou p_conta_no_limite (a marca
//     fora_do_limite, que tira a linha da contagem) não funciona.
import { describe, it, expect } from 'vitest'
import { clienteAnon, clienteEquipe, temEnvAnon, temEnvEquipe } from '../integracao/clientes'

const base = {
  p_servicos: ['sobrancelha'],
  p_barbeiro: null,
  p_inicio: '2030-01-01T13:00:00Z',
  p_nome: 'Teste Ataque',
  p_telefone: '11977776666',
}
const comLimites = { ...base, p_max_minuto: 1000, p_max_hora: 1000, p_agora: '2020-01-01T00:00:00Z', p_conta_no_limite: false }

describe.skipIf(!temEnvAnon)('anon não mexe no limite global', () => {
  const anon = clienteAnon()

  it('_criar_agendamento (corpo interno) falha para anon', async () => {
    const { data, error } = await anon.rpc('_criar_agendamento', comLimites)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('teste_criar_agendamento falha para anon', async () => {
    const { data, error } = await anon.rpc('teste_criar_agendamento', comLimites)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('criar_agendamento pública não aceita limite nem relógio por parâmetro', async () => {
    const { data, error } = await anon.rpc('criar_agendamento', comLimites)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('PGRST202') // não existe função com esses 9 parâmetros
    expect(data).toBeNull()
  })

  it('anon não lê nem escreve os limites na config', async () => {
    const lido = await anon.from('config').select('max_criacoes_por_minuto, max_criacoes_por_hora')
    expect(lido.error !== null || (lido.data ?? []).length === 0).toBe(true)
    const escrito = await anon.from('config').update({ max_criacoes_por_minuto: 100000 }).eq('id', true).select()
    expect(escrito.error !== null || (escrito.data ?? []).length === 0).toBe(true)
  })
})

describe.skipIf(!temEnvEquipe)('equipe e o limite global', () => {
  it('_criar_agendamento (corpo interno) falha até para quem está logado', async () => {
    const eq = await clienteEquipe()
    const { data, error } = await eq.rpc('_criar_agendamento', comLimites)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('teste_criar_agendamento recusa nome sem o prefixo "Teste" (URB10) antes de qualquer coisa', async () => {
    const eq = await clienteEquipe()
    const { data, error } = await eq.rpc('teste_criar_agendamento', { ...comLimites, p_nome: 'Cliente Real' })
    expect(error?.code).toBe('URB10')
    expect(data).toBeNull()
  })

  it('a equipe não consegue mudar o limite pela API (config é só leitura)', async () => {
    const eq = await clienteEquipe()
    const antes = await eq.from('config').select('max_criacoes_por_minuto').single()
    const r = await eq.from('config').update({ max_criacoes_por_minuto: 100000 }).eq('id', true).select()
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
    const depois = await eq.from('config').select('max_criacoes_por_minuto').single()
    expect(depois.data?.max_criacoes_por_minuto).toBe(antes.data?.max_criacoes_por_minuto)
  })
})

describe.skipIf(!temEnvAnon)('anon não marca fora_do_limite por nenhum caminho (QA S3)', () => {
  const anon = clienteAnon()
  const dia = '2030-01-01T13:00:00Z'

  it('insert direto em agendamentos com fora_do_limite falha', async () => {
    const r = await anon.from('agendamentos').insert({ fora_do_limite: true, cliente_nome: 'Teste X', cliente_telefone: '5511977776666', inicio: dia })
    expect(r.error).not.toBeNull()
  })

  it('update direto de fora_do_limite não altera nenhuma linha', async () => {
    const r = await anon.from('agendamentos').update({ fora_do_limite: true }).neq('fora_do_limite', true).select()
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
  })

  it('anon não lê a coluna fora_do_limite', async () => {
    const r = await anon.from('agendamentos').select('fora_do_limite')
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
  })

  it('criar_agendamento com p_conta_no_limite (qualquer combinação de parâmetros extras) não existe', async () => {
    const r = await anon.rpc('criar_agendamento', {
      p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: dia, p_nome: 'Teste X', p_telefone: '11977776666', p_conta_no_limite: false,
    })
    expect(r.error?.code).toBe('PGRST202')
    expect(r.data).toBeNull()
  })

  it('equipe também não escreve fora_do_limite direto na tabela', async () => {
    if (!temEnvEquipe) return
    const eq = await clienteEquipe()
    const r = await eq.from('agendamentos').update({ fora_do_limite: true }).eq('codigo', 'ZZZZZZ').select()
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
  })
})
