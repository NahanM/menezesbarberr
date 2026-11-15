import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvEquipe } from './clientes'

// Vários avulsos somados num agendamento (decisão do dono). Seed: corte 40 min / R$ 50,
// sobrancelha 15 min / R$ 15, limpeza-facial 30 min / R$ 35. Funcionamento ter-sex 09-20,
// almoço 12-13, grade de 30 min. São Paulo é sempre UTC-03:00.

const TZ = 'America/Sao_Paulo'
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
function partes(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}
const hhmm = (iso: string) => partes(new Date(iso)).hora
const hoje = () => partes(new Date()).dia
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
const telefone = () => `119${aleatorio(8)}`
/** Dias abertos ter-sex perto do fim da janela (longe dos outros testes). */
const dias = Array.from({ length: 24 }, (_, i) => somaDias(hoje(), 28 - i)).filter(
  (d) => dow(d) >= 2 && dow(d) <= 5,
)

describe.skipIf(!temEnvEquipe)('serviços combinados', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const criados: string[] = []

  async function horarios(servicos: string[], dia: string, barbeiro: string | null = null) {
    const { data, error } = await anon.rpc('horarios_disponiveis', {
      p_servicos: servicos, p_dia: dia, p_barbeiro: barbeiro,
    })
    return { lista: ((data ?? []) as { inicio: string }[]).map((r) => r.inicio), error }
  }
  /** publico = true: função pública (conta no limite global); usado só nos casos que NÃO criam linha (erros). */
  async function agendar(servicos: unknown, inicio: string, barbeiro: string | null = null, publico = false) {
    const args = {
      p_servicos: servicos as string[], p_barbeiro: barbeiro, p_inicio: inicio,
      p_nome: 'Teste Combinado', p_telefone: telefone(),
    }
    const r = publico ? await anon.rpc('criar_agendamento', args) : await criarComoTeste(eq, args)
    const linha = (r.data as
      | { codigo: string; servico_nome: string; preco_total_centavos: number; duracao_total_min: number }[]
      | null)?.[0]
    if (linha?.codigo) criados.push(linha.codigo)
    return { linha, error: r.error }
  }
  async function idDe(codigo: string) {
    const { data } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
    return data?.id as string
  }
  /** Um início livre para a combinação, escolhido ao acaso (testes em paralelo não disputam o mesmo). */
  async function slotLivre(servicos: string[], barbeiro: string | null = null) {
    for (const dia of dias) {
      const { lista } = await horarios(servicos, dia, barbeiro)
      if (lista.length) return { dia, inicio: lista[Math.floor(Math.random() * lista.length)] }
    }
    throw new Error('sem horário livre')
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
  }, 30000)

  afterAll(async () => {
    for (const codigo of criados) {
      await eq.rpc('mudar_status', { p_id: await idDe(codigo), p_status: 'cancelado' })
    }
  }, 60000)

  it('a duração soma: 45 min (sobrancelha + limpeza) não cabe em 11:30, que o avulso de 15 min aceita', async () => {
    for (const dia of dias) {
      const so = (await horarios(['sobrancelha'], dia)).lista.map(hhmm)
      if (!so.includes('11:30')) continue
      const soma = (await horarios(['sobrancelha', 'limpeza-facial'], dia)).lista.map(hhmm)
      expect(soma).not.toContain('11:30') // 11:30 + 45 min invade o almoço
      for (const h of soma) expect(h <= '19:00').toBe(true) // 19:15 estouraria o fechamento
      return
    }
    throw new Error('nenhum dia com 11:30 livre para sobrancelha')
  }, 60000)

  it('corte + barba = 70 min: último horário termina até as 20:00 e nenhum atendimento cruza o almoço', async () => {
    const lista = (await horarios(['corte', 'barba'], dias[0])).lista.map(hhmm)
    expect(lista.length).toBeGreaterThan(0)
    const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))
    for (const h of lista) {
      const ini = min(h)
      expect(ini + 70, `fim de ${h}`).toBeLessThanOrEqual(20 * 60)
      expect(ini >= 13 * 60 || ini + 70 <= 12 * 60, `${h} cruza o almoço`).toBe(true)
    }
    expect(lista).not.toContain('19:00') // terminaria 20:10
    expect(lista).not.toContain('11:00') // terminaria 12:10
  }, 60000)

  it('cria com corte + barba: R$ 90 e 70 min batem com o catálogo', async () => {
    const { inicio } = await slotLivre(['corte', 'barba'])
    const { linha, error } = await agendar(['corte', 'barba'], inicio)
    expect(error).toBeNull()
    expect(linha?.servico_nome).toBe('Corte + Barba')
    expect(linha?.preco_total_centavos).toBe(9000)
    expect(linha?.duracao_total_min).toBe(70)
  }, 60000)

  it('cria com corte + sobrancelha: nome combinado (na ordem recebida), preço e duração somados', async () => {
    const { inicio } = await slotLivre(['corte', 'sobrancelha'])
    const { linha, error } = await agendar(['corte', 'sobrancelha'], inicio)
    expect(error).toBeNull()
    expect(linha?.servico_nome).toBe('Corte + Sobrancelha')
    expect(linha?.preco_total_centavos).toBe(6500)
    expect(linha?.duracao_total_min).toBe(55)

    const id = await idDe(linha!.codigo)
    // O painel enxerga o nome combinado e o fim = início + 55 min.
    const dia = partes(new Date(inicio)).dia
    const ag = await eq.rpc('listar_agenda', { p_de: dia, p_ate: dia })
    expect(ag.error).toBeNull()
    const meu = (ag.data as { id: string; servico_nome: string; inicio: string; fim: string }[]).find(
      (a) => a.id === id,
    )
    expect(meu?.servico_nome).toBe('Corte + Sobrancelha')
    expect(Date.parse(meu!.fim) - Date.parse(meu!.inicio)).toBe(55 * 60_000)
  }, 60000)

  it('os 55 minutos somados bloqueiam o barbeiro: avulso de 15 min dentro do período é recusado', async () => {
    const { dia, inicio } = await slotLivre(['corte', 'sobrancelha'], 'rafael')
    const { error } = await agendar(['corte', 'sobrancelha'], inicio, 'rafael')
    expect(error).toBeNull()
    // 30 min depois ainda está dentro dos 55 min do atendimento.
    const dentro = new Date(Date.parse(inicio) + 30 * 60_000).toISOString()
    const livres = (await horarios(['sobrancelha'], dia, 'rafael')).lista
    expect(livres.map((i) => Date.parse(i))).not.toContain(Date.parse(dentro))
    const r = await agendar(['sobrancelha'], dentro, 'rafael')
    expect(r.error?.code).toBe('URB05')
  }, 60000)

  it('combinação inválida: URB16 (horarios_disponiveis e criar_agendamento)', async () => {
    const dia = dias[0]
    const inicio = `${dia}T10:00:00-03:00`
    const invalidas: unknown[][] = [
      ['essencial', 'corte'], // combo misturado com avulso
      ['essencial', 'cuidado-completo'], // dois combos
      ['corte', 'corte'], // repetido
      ['corte', 'barba', 'sobrancelha', 'limpeza-facial', 'hidratacao', 'depilacao'], // 6 > 5
      ['corte', null], // item nulo
    ]
    for (const lista of invalidas) {
      const h = await anon.rpc('horarios_disponiveis', { p_servicos: lista, p_dia: dia })
      expect(h.error?.code, `horarios ${JSON.stringify(lista)}`).toBe('URB16')
      const c = await agendar(lista, inicio, null, true)
      expect(c.error?.code, `criar ${JSON.stringify(lista)}`).toBe('URB16')
    }
  }, 60000)

  it('lista vazia ou nula: URB08; slug inexistente no meio da lista: URB01', async () => {
    const dia = dias[0]
    const inicio = `${dia}T10:00:00-03:00`
    expect((await agendar([], inicio, null, true)).error?.code).toBe('URB08')
    expect((await agendar(null, inicio, null, true)).error?.code).toBe('URB08')
    expect((await agendar(['corte', 'nao-existe'], inicio, null, true)).error?.code).toBe('URB01')
    const h = await anon.rpc('horarios_disponiveis', { p_servicos: [], p_dia: dia })
    expect(h.error?.code).toBe('URB08')
  }, 60000)

  it('a assinatura antiga (um slug) deixou de existir', async () => {
    const velha = await anon.rpc('horarios_disponiveis', { p_servico: 'corte', p_dia: dias[0] })
    expect(velha.error).not.toBeNull()
    expect(velha.data).toBeNull()
  }, 30000)

  it('anônimo não lê agendamento_servicos; funções internas não são chamáveis', async () => {
    const { data, error } = await anon.from('agendamento_servicos').select('*')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
    for (const [fn, args] of [
      ['_resolver_servicos', { p_servicos: ['corte'] }],
      ['_nome_servicos', { p_agendamento_id: '00000000-0000-0000-0000-000000000000' }],
      ['_slots_livres', { p_duracao_min: 30, p_dia: dias[0], p_barbeiro_id: null }],
    ] as const) {
      const r = await anon.rpc(fn, args)
      expect(r.error, fn).not.toBeNull()
    }
  }, 30000)

  it('a equipe não lê nem escreve direto em agendamento_servicos (o painel lê por função)', async () => {
    const lido = await eq.from('agendamento_servicos').select('agendamento_id').limit(1)
    expect(lido.error).not.toBeNull()
    const escrito = await eq.from('agendamento_servicos').delete().neq('ordem', 0)
    expect(escrito.error).not.toBeNull()
  }, 30000)
})
