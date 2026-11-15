import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvEquipe } from './clientes'

// Funções do painel. Isolamento: os slots saem de horarios_disponiveis, nos dias
// do FIM da janela (o agendamento.test.ts usa o começo). Tudo que criamos é
// cancelado/removido no afterAll, um a um. Nenhum estado terminal além de cancelado.

const TZ = 'America/Sao_Paulo'
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
function partes(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}
const diaSP = (iso: string) => partes(new Date(iso)).dia
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const hoje = () => partes(new Date()).dia
const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
const telefone = () => `119${aleatorio(8)}`
const mais = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString()

// Dias abertos (ter-sex) do fim da janela para o começo.
const diasFim: string[] = []
for (let i = 29; i >= 10 && diasFim.length < 12; i--) {
  const d = somaDias(hoje(), i)
  if (dow(d) >= 2 && dow(d) <= 5) diasFim.push(d)
}

describe('painel: acesso negado ao anônimo', () => {
  const anon = clienteAnon()
  const id = '00000000-0000-0000-0000-000000000000'
  it.each([
    ['listar_agenda', { p_de: '2030-01-01', p_ate: '2030-01-02' }],
    ['listar_bloqueios', { p_de: '2030-01-01', p_ate: '2030-01-02' }],
    ['mudar_status', { p_id: id, p_status: 'confirmado' }],
    ['criar_bloqueio', { p_barbeiro_id: null, p_inicio: '2030-01-01T12:00:00Z', p_fim: '2030-01-01T13:00:00Z', p_motivo: '' }],
    ['remover_bloqueio', { p_id: id }],
  ])('%s: anon leva 42501', async (nome, args) => {
    const { error } = await anon.rpc(nome, args)
    expect(error?.code).toBe('42501')
  }, 30000)

  it('insert direto em bloqueios por anon falha', async () => {
    const { error } = await anon.from('bloqueios').insert({ periodo: '[2030-01-01T12:00:00Z,2030-01-01T13:00:00Z)', motivo: 'x' })
    expect(error).not.toBeNull()
  })
})

describe.skipIf(!temEnvEquipe)('painel: sessão da equipe', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const codigos: string[] = []
  const bloqueios: string[] = []
  let rafael = ''

  async function horarios(dia: string, barbeiro: string | null, servico = 'sobrancelha') {
    const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: [servico], p_dia: dia, p_barbeiro: barbeiro })
    return ((data ?? []) as { inicio: string }[]).map((r) => r.inicio)
  }
  /** Primeiro (dia, início) livre para o barbeiro, nos dias do fim da janela. */
  async function achar(barbeiro: string | null, pular = 0) {
    let n = 0
    for (const dia of diasFim) {
      const h = await horarios(dia, barbeiro)
      for (const inicio of h) if (n++ >= pular) return { dia, inicio }
    }
    throw new Error('sem horário livre')
  }
  async function agendar(inicio: string, o: { barbeiro?: string | null; nome?: string; tel?: string } = {}) {
    const r = await criarComoTeste(eq, {
      p_servicos: ['sobrancelha'], p_barbeiro: o.barbeiro ?? null, p_inicio: inicio,
      p_nome: o.nome ?? 'Teste Painel', p_telefone: o.tel ?? telefone(),
    })
    const linha = (r.data as { codigo: string }[] | null)?.[0]
    if (linha?.codigo) codigos.push(linha.codigo)
    expect(r.error).toBeNull()
    return linha!.codigo
  }
  async function agenda(dia: string, ate = dia) {
    const r = await eq.rpc('listar_agenda', { p_de: dia, p_ate: ate })
    expect(r.error).toBeNull()
    return (r.data ?? []) as Record<string, string>[]
  }
  async function idDe(codigo: string, dia: string) {
    const l = (await agenda(dia)).find((x) => x.codigo === codigo)
    expect(l, `agendamento ${codigo} em ${dia}`).toBeDefined()
    return l!.id
  }
  async function bloquear(barbeiro: string | null, inicio: string, fim: string, motivo = 'Teste QA') {
    const r = await eq.rpc('criar_bloqueio', { p_barbeiro_id: barbeiro, p_inicio: inicio, p_fim: fim, p_motivo: motivo })
    const linha = (r.data as { id: string; conflitos: number }[] | null)?.[0]
    if (linha?.id) bloqueios.push(linha.id)
    return { linha, error: r.error }
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
    const { data } = await eq.from('barbeiros').select('id').eq('slug', 'rafael').single()
    rafael = data!.id
  }, 30000)

  afterAll(async () => {
    for (const id of bloqueios) await eq.rpc('remover_bloqueio', { p_id: id })
    for (const codigo of codigos) {
      const { data } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
      if (data) await eq.rpc('mudar_status', { p_id: data.id, p_status: 'cancelado' })
    }
  }, 60000)

  describe('listar_agenda', () => {
    it('devolve o agendamento criado, com nome, telefone canônico e início no dia pedido', async () => {
      const { dia, inicio } = await achar(null)
      const tel = telefone()
      const nome = `Teste Cliente ${aleatorio(5)}`
      const codigo = await agendar(inicio, {
        nome, tel: `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`,
      })
      const l = (await agenda(dia)).find((x) => x.codigo === codigo)
      expect(l).toBeDefined()
      expect(l!.cliente_nome).toBe(nome)
      expect(l!.cliente_telefone).toMatch(/^\d+$/)
      expect(l!.cliente_telefone.endsWith(tel)).toBe(true)
      expect(l!.status).toBe('pendente')
      expect(diaSP(l!.inicio)).toBe(dia)
      expect(new Date(l!.inicio).getTime()).toBe(new Date(inicio).getTime())
      expect(new Date(l!.fim).getTime()).toBeGreaterThan(new Date(l!.inicio).getTime())
      expect(l!.servico_nome).toBeTruthy()
      expect(l!.barbeiro_nome).toBeTruthy()
    }, 60000)

    it('período de 31 dias passa; 32 dias, fim antes do início e nulo dão URB10', async () => {
      const d = diasFim[0]
      expect((await eq.rpc('listar_agenda', { p_de: d, p_ate: somaDias(d, 30) })).error).toBeNull()
      expect((await eq.rpc('listar_agenda', { p_de: d, p_ate: somaDias(d, 31) })).error?.code).toBe('URB10')
      expect((await eq.rpc('listar_agenda', { p_de: d, p_ate: somaDias(d, -1) })).error?.code).toBe('URB10')
      expect((await eq.rpc('listar_agenda', { p_de: null, p_ate: d })).error?.code).toBe('URB10')
      expect((await eq.rpc('listar_bloqueios', { p_de: d, p_ate: somaDias(d, 31) })).error?.code).toBe('URB10')
    }, 30000)
  })

  describe('mudar_status', () => {
    it('pendente -> confirmado ok; confirmado -> pendente recusado; cancelado ok', async () => {
      const { dia, inicio } = await achar(null, 1)
      const codigo = await agendar(inicio)
      const id = await idDe(codigo, dia)
      const ok = await eq.rpc('mudar_status', { p_id: id, p_status: 'confirmado' })
      expect(ok.error).toBeNull()
      expect((ok.data as { status: string }[])[0].status).toBe('confirmado')
      const volta = await eq.rpc('mudar_status', { p_id: id, p_status: 'pendente' })
      expect(volta.error).not.toBeNull()
      expect((await agenda(dia)).find((x) => x.id === id)?.status).toBe('confirmado')
      expect((await eq.rpc('mudar_status', { p_id: id, p_status: 'cancelado' })).error).toBeNull()
    }, 60000)

    it('id inexistente dá URB11', async () => {
      const r = await eq.rpc('mudar_status', { p_id: '00000000-0000-0000-0000-000000000000', p_status: 'confirmado' })
      expect(r.error?.code).toBe('URB11')
    })
  })

  describe('bloqueios', () => {
    it('criar_bloqueio num horário livre: conflitos 0; some para o barbeiro; listar mostra; remover devolve', async () => {
      const { dia, inicio } = await achar('rafael', 2)
      const b = await bloquear(rafael, inicio, mais(inicio, 30), 'Folga QA')
      expect(b.error).toBeNull()
      expect(b.linha?.conflitos).toBe(0)
      expect(await horarios(dia, 'rafael')).not.toContain(inicio)

      const lista = await eq.rpc('listar_bloqueios', { p_de: dia, p_ate: dia })
      expect(lista.error).toBeNull()
      const achado = (lista.data as Record<string, string>[]).find((x) => x.id === b.linha!.id)
      expect(achado?.motivo).toBe('Folga QA')
      expect(achado?.barbeiro_nome).toBe('Rafael')

      expect((await eq.rpc('remover_bloqueio', { p_id: b.linha!.id })).error).toBeNull()
      expect(await horarios(dia, 'rafael')).toContain(inicio)
      expect((await eq.rpc('remover_bloqueio', { p_id: b.linha!.id })).error?.code).toBe('URB15')
    }, 60000)

    it('bloqueio com barbeiro null some para todos (e aparece com barbeiro_nome nulo)', async () => {
      const { dia, inicio } = await achar(null, 3)
      const b = await bloquear(null, inicio, mais(inicio, 30), 'Todos QA')
      expect(b.error).toBeNull()
      expect(await horarios(dia, null)).not.toContain(inicio)
      for (const s of ['rafael', 'diego', 'caio']) expect(await horarios(dia, s)).not.toContain(inicio)
      const lista = await eq.rpc('listar_bloqueios', { p_de: dia, p_ate: dia })
      const achado = (lista.data as Record<string, string | null>[]).find((x) => x.id === b.linha!.id)
      expect(achado?.barbeiro_nome).toBeNull()
      await eq.rpc('remover_bloqueio', { p_id: b.linha!.id })
      expect(await horarios(dia, null)).toContain(inicio)
    }, 60000)

    it('bloqueio sobre agendamento ativo conta conflito e não cancela', async () => {
      const { dia, inicio } = await achar('diego', 4)
      const codigo = await agendar(inicio, { barbeiro: 'diego' })
      const { data: dg } = await eq.from('barbeiros').select('id').eq('slug', 'diego').single()
      const b = await bloquear(dg!.id, inicio, mais(inicio, 30))
      expect(b.error).toBeNull()
      expect(b.linha?.conflitos).toBe(1)
      expect((await agenda(dia)).find((x) => x.codigo === codigo)?.status).toBe('pendente')
      await eq.rpc('remover_bloqueio', { p_id: b.linha!.id })
    }, 60000)

    it('URB12: fim <= início, fim antes, mais de 14 dias; 14 dias exatos passa', async () => {
      const i = `${diasFim[0]}T13:00:00Z`
      expect((await bloquear(null, i, i)).error?.code).toBe('URB12')
      expect((await bloquear(null, i, mais(i, -30))).error?.code).toBe('URB12')
      expect((await bloquear(null, i, mais(i, 14 * 24 * 60 + 1))).error?.code).toBe('URB12')
      const ok = await bloquear(null, `${diasFim[0]}T00:00:00Z`, `${diasFim[0]}T00:30:00Z`)
      expect(ok.error).toBeNull()
      const limite = await bloquear(rafael, `${somaDias(diasFim[0], 1)}T00:00:00Z`, `${somaDias(diasFim[0], 15)}T00:00:00Z`)
      expect(limite.error).toBeNull()
    }, 60000)

    it('URB13: motivo com 121 caracteres recusado; 120 aceito', async () => {
      const i = `${diasFim[1]}T00:00:00Z`
      expect((await bloquear(null, i, mais(i, 30), 'a'.repeat(121))).error?.code).toBe('URB13')
      expect((await bloquear(null, i, mais(i, 30), 'a'.repeat(120))).error).toBeNull()
    }, 30000)

    it('URB14: barbeiro inexistente', async () => {
      const i = `${diasFim[1]}T00:00:00Z`
      expect((await bloquear('00000000-0000-0000-0000-000000000000', i, mais(i, 30))).error?.code).toBe('URB14')
    })

    it('insert direto em bloqueios pela equipe falha (escrita só pelas funções)', async () => {
      const r = await eq.from('bloqueios').insert({ periodo: `[${diasFim[2]}T00:00:00Z,${diasFim[2]}T00:30:00Z)`, motivo: 'direto' })
      expect(r.error).not.toBeNull()
    })
  })
})
