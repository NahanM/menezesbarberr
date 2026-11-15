import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { barbeiros, combos, servicosAvulsos } from '../../src/data/barbearia'
import { clienteAnon, clienteEquipe, temEnvAnon, temEnvEquipe } from './clientes'

const tabelas = ['config', 'funcionamento', 'servicos', 'barbeiros', 'bloqueios', 'agendamentos', 'equipe']
const UUID = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!temEnvAnon)('anon: sem acesso direto', () => {
  const anon = clienteAnon()

  it.each(tabelas)('select em %s: erro ou vazio', async (t) => {
    const { data, error } = await anon.from(t).select('*')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('insert em agendamentos falha', async () => {
    const { error } = await anon.from('agendamentos').insert({
      servico_id: UUID, barbeiro_id: UUID, cliente_nome: 'Teste', cliente_telefone: '11999999999',
    })
    expect(error).not.toBeNull()
  })

  it('insert em bloqueios falha', async () => {
    const { error } = await anon.from('bloqueios').insert({ periodo: '[2030-01-01T10:00:00Z,2030-01-01T11:00:00Z)' })
    expect(error).not.toBeNull()
  })

  // update/delete sem permissão: pode vir erro, ou 0 linhas afetadas. Nunca deve afetar linha.
  it.each(['agendamentos', 'bloqueios'])('update em %s não afeta nada', async (t) => {
    const { data, error } = await anon.from(t).update(t === 'bloqueios' ? { motivo: 'x' } : { status: 'cancelado' }).eq('id', UUID).select()
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
  it.each(['agendamentos', 'bloqueios'])('delete em %s não afeta nada', async (t) => {
    const { data, error } = await anon.from(t).delete().eq('id', UUID).select()
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
  it.each(['agendamentos', 'bloqueios'])('update em %s (erro esperado, sem filtro de id) ', async (t) => {
    const { error } = await anon.from(t).update(t === 'bloqueios' ? { motivo: 'x' } : { status: 'cancelado' }).neq('id', UUID)
    expect(error).not.toBeNull()
  })

  it('rpc is_equipe falha para anon', async () => {
    const { error } = await anon.rpc('is_equipe')
    expect(error).not.toBeNull()
  })
})

describe.skipIf(!temEnvEquipe)('equipe: catálogo e limites', () => {
  let eq: SupabaseClient
  beforeAll(async () => {
    eq = await clienteEquipe()
  })

  it('is_equipe() = true', async () => {
    const { data, error } = await eq.rpc('is_equipe')
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('servicos ativos batem com barbearia.ts (slug, preço, duração)', async () => {
    const { data, error } = await eq
      .from('servicos').select('slug, tipo, preco_centavos, duracao_min').eq('ativo', true)
    expect(error).toBeNull()
    const esperado = [
      ...combos.map((c) => ({ slug: c.slug, tipo: 'combo', preco_centavos: c.precoCentavos, duracao_min: c.duracaoMinutos })),
      ...servicosAvulsos.map((s) => ({ slug: s.slug, tipo: 'avulso', preco_centavos: s.precoCentavos, duracao_min: s.duracaoMinutos })),
    ].sort((a, b) => a.slug.localeCompare(b.slug))
    const obtido = [...(data ?? [])].sort((a, b) => a.slug.localeCompare(b.slug))
    expect(obtido).toEqual(esperado)
  })

  it('barbeiros ativos têm os mesmos slugs', async () => {
    const { data, error } = await eq.from('barbeiros').select('slug').eq('ativo', true)
    expect(error).toBeNull()
    expect((data ?? []).map((b) => b.slug).sort()).toEqual(barbeiros.map((b) => b.slug).sort())
  })

  it('insert direto em agendamentos falha mesmo para a equipe', async () => {
    const { data: s } = await eq.from('servicos').select('id').limit(1).single()
    const { data: b } = await eq.from('barbeiros').select('id').limit(1).single()
    const { error } = await eq.from('agendamentos').insert({
      servico_id: s!.id, barbeiro_id: b!.id, cliente_nome: 'Teste QA', cliente_telefone: '11999999999',
      periodo: '[2030-01-01T13:00:00Z,2030-01-01T14:00:00Z)',
    })
    expect(error).not.toBeNull()
  })
})

// O teste de signUp (sessão autenticada que não é da equipe) vive em tests/seguranca/ataque.test.ts:
// signUp gasta cota de e-mail do Auth e só precisa rodar na suíte de segurança.
