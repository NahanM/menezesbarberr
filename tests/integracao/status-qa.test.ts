import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvAnon, temEnvEquipe } from './clientes'

// QA 4.4: transições de status no REMOTO. Cria 1 agendamento "[E2E] QA status" por teste que precisa,
// em dias de meio de janela, e SEMPRE termina cancelado (afterAll). Tudo pela RPC pública.

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const alea = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')

const ZERO = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!temEnvAnon)('status: anônimo', () => {
  const anon = clienteAnon()
  it.each(['confirmado', 'concluido', 'nao_compareceu', 'cancelado'])('mudar_status(%s) com id inexistente: 42501', async (s) => {
    const { error } = await anon.rpc('mudar_status', { p_id: ZERO, p_status: s })
    expect(error?.code).toBe('42501')
  }, 30000)
  it('update direto em agendamentos não altera nada e não vaza linhas', async () => {
    const r = await anon.from('agendamentos').update({ status: 'concluido' }).neq('id', ZERO).select()
    expect(r.data ?? []).toHaveLength(0)
  }, 30000)
  it('select direto em agendamentos devolve vazio ou erro (nunca nome/telefone)', async () => {
    const r = await anon.from('agendamentos').select('*').limit(5)
    expect(r.data ?? []).toHaveLength(0)
  }, 30000)
  it('a função do trigger não é chamável por anon', async () => {
    const r = await anon.rpc('validar_transicao_status')
    expect(r.error).not.toBeNull()
  }, 30000)
})

describe.skipIf(!temEnvEquipe)('status: equipe no remoto', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const criados: string[] = []
  const usados = new Set<string>()

  beforeAll(async () => {
    eq = await clienteEquipe()
  }, 30000)

  afterAll(async () => {
    for (const codigo of criados) {
      const { data } = await eq.from('agendamentos').select('id,status').eq('codigo', codigo).single()
      if (data && ['pendente', 'confirmado'].includes(data.status)) {
        await eq.rpc('mudar_status', { p_id: data.id, p_status: 'cancelado' })
      }
    }
  }, 60000)

  /** Cria um agendamento num dia útil entre hoje+11 e hoje+19, no primeiro horário livre ainda não usado. */
  async function criar(): Promise<string> {
    for (let i = 11; i <= 19; i++) {
      const dia = somaDias(hoje(), i)
      if (dow(dia) < 2 || dow(dia) > 5) continue
      const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: null })
      for (const h of (data ?? []) as { inicio: string }[]) {
        if (usados.has(h.inicio)) continue
        usados.add(h.inicio)
        const r = await criarComoTeste(eq, {
          p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: h.inicio,
          p_nome: `Teste QA status ${alea(4)}`, p_telefone: `119${alea(8)}`,
        })
        expect(r.error).toBeNull()
        const codigo = (r.data as { codigo: string }[])[0].codigo
        criados.push(codigo)
        const { data: linha } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
        return linha!.id
      }
    }
    throw new Error('sem horário livre')
  }
  const mudar = (id: string, status: string) => eq.rpc('mudar_status', { p_id: id, p_status: status })
  const statusDe = async (id: string) => (await eq.from('agendamentos').select('status').eq('id', id).single()).data?.status

  it('id inexistente: URB11', async () => {
    const r = await mudar(ZERO, 'confirmado')
    expect(r.error?.code).toBe('URB11')
  }, 30000)

  it('status inválido (fora do enum) é recusado e não vaza erro 500', async () => {
    const id = await criar()
    const r = await mudar(id, 'apagado')
    expect(r.error).not.toBeNull()
    expect(await statusDe(id)).toBe('pendente')
  }, 60000)

  it('pendente -> concluido e pendente -> nao_compareceu: 23514, não URB17', async () => {
    const id = await criar()
    for (const s of ['concluido', 'nao_compareceu']) {
      const r = await mudar(id, s)
      expect(r.error?.code, s).toBe('23514')
    }
    expect(await statusDe(id)).toBe('pendente')
  }, 60000)

  it('confirmado futuro: concluido e nao_compareceu dão URB17; status não muda; cancelar funciona', async () => {
    const id = await criar()
    expect((await mudar(id, 'confirmado')).error).toBeNull()
    for (const s of ['concluido', 'nao_compareceu']) {
      const r = await mudar(id, s)
      expect(r.error?.code, s).toBe('URB17')
    }
    expect(await statusDe(id)).toBe('confirmado')
    const c = await mudar(id, 'cancelado')
    expect(c.error).toBeNull()
    expect((c.data as { status: string }[])[0].status).toBe('cancelado')
  }, 60000)

  it('cancelado é final: confirmado, concluido, nao_compareceu, pendente dão 23514', async () => {
    const id = await criar()
    expect((await mudar(id, 'cancelado')).error).toBeNull()
    for (const s of ['pendente', 'confirmado', 'concluido', 'nao_compareceu']) {
      const r = await mudar(id, s)
      expect(r.error?.code, s).toBe('23514')
    }
    expect(await statusDe(id)).toBe('cancelado')
  }, 60000)

  it('confirmado -> pendente é recusado (não volta)', async () => {
    const id = await criar()
    expect((await mudar(id, 'confirmado')).error).toBeNull()
    expect((await mudar(id, 'pendente')).error?.code).toBe('23514')
  }, 60000)

  it('equipe não consegue pular a função: update direto na tabela não muda o status', async () => {
    const id = await criar()
    expect((await mudar(id, 'confirmado')).error).toBeNull()
    const r = await eq.from('agendamentos').update({ status: 'concluido' }).eq('id', id).select()
    expect(r.data ?? []).toHaveLength(0)
    expect(await statusDe(id)).toBe('confirmado')
  }, 60000)

  it('cancelar libera o horário: aparece de novo em horarios_disponiveis', async () => {
    const id = await criar()
    const { data: ag } = await eq.rpc('listar_agenda', { p_de: somaDias(hoje(), 11), p_ate: somaDias(hoje(), 19) })
    const linha = (ag as { id: string; inicio: string }[]).find((l) => l.id === id)!
    const dia = fmt.format(new Date(linha.inicio))
    const antes = ((await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: null })).data ?? []) as { inicio: string }[]
    expect((await mudar(id, 'cancelado')).error).toBeNull()
    const depois = ((await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: null })).data ?? []) as { inicio: string }[]
    expect(depois.length).toBeGreaterThanOrEqual(antes.length)
    expect(depois.some((h) => new Date(h.inicio).getTime() === new Date(linha.inicio).getTime())).toBe(true)
  }, 60000)
})
