// Portão de segurança da Fase 4 (painel): ataques reais ao projeto Supabase do .env.
// Visitante = só a chave pública. Equipe = E2E_EMAIL/E2E_SENHA (para criar alvos reais
// e provar que nem a equipe escreve direto nas tabelas).
// Todo dado criado leva o prefixo [E2E]. No fim: bloqueios removidos, agendamentos cancelados
// (não existe delete de agendamento por nenhum caminho da API, de propósito).
// NÃO cria contas no Auth.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvEquipe, url, chave } from '../integracao/clientes'

const UUID = '00000000-0000-0000-0000-000000000000'
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const tel = () => `119${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}`
const log = (titulo: string, r: unknown) => console.log(`[seguranca-f4] ${titulo}: ${JSON.stringify(r)}`)

describe.skipIf(!temEnvEquipe)('Fase 4: painel sob ataque', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const codigos: string[] = []
  const bloqueios: string[] = []
  const slotsUsados = new Set<string>()

  async function slotLivre(): Promise<string> {
    for (let i = 29; i >= 7; i--) {
      const dia = somaDias(hoje(), i)
      if (dow(dia) < 2 || dow(dia) > 5) continue
      const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia })
      const lista = ((data ?? []) as { inicio: string }[]).map((x) => x.inicio).filter((x) => !slotsUsados.has(x))
      if (lista.length) {
        const s = lista[lista.length - 1]
        slotsUsados.add(s)
        return s
      }
    }
    throw new Error('sem horário livre')
  }

  // Cria pelo caminho de teste (fora da cota do limite global): aqui o alvo é o painel, não a função pública.
  async function agendar(telefone: string, inicio?: string) {
    const r = await criarComoTeste(eq, {
      p_servicos: ['sobrancelha'],
      p_barbeiro: null,
      p_inicio: inicio ?? (await slotLivre()),
      p_nome: 'Teste Seguranca F4',
      p_telefone: telefone,
    })
    const linha = (r.data as { codigo: string }[] | null)?.[0]
    if (linha?.codigo) codigos.push(linha.codigo)
    return { linha, error: r.error }
  }

  async function idDe(codigo: string): Promise<string> {
    const { data } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
    return (data as { id: string }).id
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
  }, 30000)

  afterAll(async () => {
    let falhas = 0
    for (const id of bloqueios) {
      const { error } = await eq.rpc('remover_bloqueio', { p_id: id })
      if (error) falhas++
    }
    for (const c of codigos) {
      const id = await idDe(c)
      const { error } = await eq.rpc('mudar_status', { p_id: id, p_status: 'cancelado' })
      if (error && !/inválida: cancelado -> cancelado/.test(error.message)) falhas++
    }
    log('limpeza', { bloqueiosRemovidos: bloqueios.length, agendamentosCancelados: codigos.length, falhas })
  }, 60000)

  // ---------------- anon: escrita direta ----------------
  it('anon: insert/update/delete direto em todas as tabelas falha', async () => {
    const tentativas = [
      ['agendamentos insert', anon.from('agendamentos').insert({ servico_id: UUID, barbeiro_id: UUID, cliente_nome: '[E2E] x', cliente_telefone: '11999999999', periodo: '[2030-01-01 10:00,2030-01-01 11:00)' })],
      ['agendamentos update', anon.from('agendamentos').update({ status: 'cancelado' }).neq('id', UUID).select()],
      ['agendamentos delete', anon.from('agendamentos').delete().neq('id', UUID).select()],
      ['bloqueios insert', anon.from('bloqueios').insert({ barbeiro_id: null, periodo: '[2030-01-01 10:00,2030-01-01 11:00)', motivo: '[E2E]' })],
      ['bloqueios delete', anon.from('bloqueios').delete().neq('id', UUID).select()],
      ['equipe insert', anon.from('equipe').insert({ user_id: UUID, nome: '[E2E] x' })],
      ['agendamento_servicos select', anon.from('agendamento_servicos').select('*')],
      ['agendamento_servicos insert', anon.from('agendamento_servicos').insert({ agendamento_id: UUID, servico_id: UUID, preco_centavos: 0, duracao_min: 1, ordem: 1 })],
      ['servicos update preço', anon.from('servicos').update({ preco_centavos: 0 }).neq('id', UUID).select()],
    ] as const
    for (const [nome, p] of tentativas) {
      const { data, error } = await p
      log(`anon ${nome}`, { code: error?.code, n: Array.isArray(data) ? data.length : null })
      expect(error !== null || (Array.isArray(data) && data.length === 0)).toBe(true)
    }
  })

  it('anon: enumeração de clientes (filtro por telefone/nome e contagem) não devolve nada', async () => {
    const a = await anon.from('agendamentos').select('cliente_nome,cliente_telefone').like('cliente_telefone', '55%')
    const b = await anon.from('agendamentos').select('*', { count: 'exact', head: true })
    const c = await anon.from('agendamentos').select('cliente_nome').ilike('cliente_nome', '%a%')
    log('anon enumeração', { a: a.error?.code ?? a.data?.length, b: b.error?.code ?? b.count, c: c.error?.code ?? c.data?.length })
    for (const r of [a, c]) expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
    expect(b.error !== null || !b.count).toBe(true)
  })

  it('anon: RPCs do painel por GET e com Bearer = chave pública também falham', async () => {
    const h = { apikey: chave!, Authorization: `Bearer ${chave}` }
    const r1 = await fetch(`${url}/rest/v1/rpc/listar_agenda?p_de=${hoje()}&p_ate=${somaDias(hoje(), 30)}`, { headers: h })
    const r2 = await fetch(`${url}/rest/v1/rpc/listar_bloqueios?p_de=${hoje()}&p_ate=${somaDias(hoje(), 30)}`, { headers: h })
    const t1 = await r1.text()
    const t2 = await r2.text()
    log('GET rpc', { listar_agenda: r1.status, listar_bloqueios: r2.status, corpo: t1.slice(0, 100) })
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    expect(t1).not.toMatch(/cliente_telefone|55\d{10}/)
    expect(t2).not.toMatch(/cliente_telefone|55\d{10}/)
  })

  it('anon: assinaturas antigas (1 slug) não existem mais', async () => {
    const r = await anon.rpc('criar_agendamento', { p_servico: 'sobrancelha', p_barbeiro: null, p_inicio: '2030-01-01T13:00:00Z', p_nome: '[E2E] x', p_telefone: '11999999999' })
    log('criar_agendamento antigo', { code: r.error?.code })
    expect(r.error).not.toBeNull()
  })

  // ---------------- alvo real: anon tenta mexer num agendamento existente ----------------
  it('anon: mudar_status num id REAL falha com 42501 e o status não muda', async () => {
    const { linha, error } = await agendar(tel())
    expect(error).toBeNull()
    const id = await idDe(linha!.codigo)
    const r = await anon.rpc('mudar_status', { p_id: id, p_status: 'cancelado' })
    log('anon mudar_status id real', { code: r.error?.code })
    expect(r.error?.code).toBe('42501')
    const { data } = await eq.from('agendamentos').select('status').eq('id', id).single()
    expect((data as { status: string }).status).toBe('pendente')
  }, 60000)

  // ---------------- equipe: nem ela escreve direto ----------------
  it('equipe: escrita direta nas tabelas falha (só pelas funções)', async () => {
    const tentativas = [
      ['bloqueios insert', eq.from('bloqueios').insert({ barbeiro_id: null, periodo: '[2030-01-01 10:00,2030-01-01 11:00)', motivo: '[E2E]' }).select()],
      ['agendamentos update', eq.from('agendamentos').update({ status: 'cancelado' }).eq('id', UUID).select()],
      ['agendamentos delete', eq.from('agendamentos').delete().eq('id', UUID).select()],
      ['agendamentos update nome', eq.from('agendamentos').update({ cliente_nome: '[E2E] x' }).eq('id', UUID).select()],
      ['equipe insert (escalar outro usuário)', eq.from('equipe').insert({ user_id: UUID, nome: '[E2E] x' }).select()],
      ['agendamento_servicos select', eq.from('agendamento_servicos').select('*')],
    ] as const
    for (const [nome, p] of tentativas) {
      const { data, error } = await p
      log(`equipe ${nome}`, { code: error?.code, n: Array.isArray(data) ? data.length : null })
      expect(error).not.toBeNull()
    }
  })

  it('authenticated (sessão da equipe): funções internas continuam sem EXECUTE', async () => {
    const internas: [string, Record<string, unknown>][] = [
      ['_slots_livres', { p_duracao_min: 30, p_dia: hoje(), p_barbeiro_id: null }],
      ['_resolver_servicos', { p_servicos: ['sobrancelha'] }],
      ['_nome_servicos', { p_agendamento_id: UUID }],
      ['gerar_codigo_curto', {}],
    ]
    for (const [fn, args] of internas) {
      const { error } = await eq.rpc(fn, args)
      log(`equipe rpc ${fn}`, { code: error?.code })
      expect(error?.code).toBe('42501')
    }
  })

  // ---------------- migration 20261010100000: concluir só depois do início ----------------
  it('trigger: concluir / não compareceu antes do início = URB17', async () => {
    const { linha, error } = await agendar(tel())
    expect(error).toBeNull()
    const id = await idDe(linha!.codigo)
    const c = await eq.rpc('mudar_status', { p_id: id, p_status: 'confirmado' })
    expect(c.error).toBeNull()
    const r1 = await eq.rpc('mudar_status', { p_id: id, p_status: 'concluido' })
    const r2 = await eq.rpc('mudar_status', { p_id: id, p_status: 'nao_compareceu' })
    const r3 = await eq.rpc('mudar_status', { p_id: id, p_status: 'pendente' })
    log('trigger', { concluido: r1.error?.code, nao_compareceu: r2.error?.code, voltar_pendente: r3.error?.code })
    expect(r1.error?.code).toBe('URB17')
    expect(r2.error?.code).toBe('URB17')
    expect(r3.error?.code).toBe('23514')
  }, 60000)

  // ---------------- motivo do bloqueio ----------------
  it('motivo: HTML é guardado literal; >120 e 5.000 caracteres = URB13; passado e >14 dias = URB12', async () => {
    const dia = somaDias(hoje(), 20)
    const ini = `${dia}T03:00:00-03:00`
    const fim = `${dia}T04:00:00-03:00`
    const html = '[E2E] <img src=x onerror=alert(1)><script>alert(2)</script>'
    const ok = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: ini, p_fim: fim, p_motivo: html })
    expect(ok.error).toBeNull()
    const id = (ok.data as { id: string }[])[0].id
    bloqueios.push(id)
    const lista = await eq.rpc('listar_bloqueios', { p_de: dia, p_ate: dia })
    const achado = ((lista.data ?? []) as { id: string; motivo: string }[]).find((k) => k.id === id)
    log('motivo html', { gravado: achado?.motivo })
    expect(achado?.motivo).toBe(html)

    const e120 = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: ini, p_fim: fim, p_motivo: '[E2E]' + 'x'.repeat(115) })
    if (!e120.error) bloqueios.push((e120.data as { id: string }[])[0].id)
    expect(e120.error).toBeNull()
    const e121 = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: ini, p_fim: fim, p_motivo: '[E2E]' + 'x'.repeat(116) })
    const e5k = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: ini, p_fim: fim, p_motivo: '[E2E]' + 'x'.repeat(5000) })
    const passado = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: '2020-01-01T10:00:00Z', p_fim: '2020-01-01T11:00:00Z', p_motivo: '[E2E]' })
    const longo = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: ini, p_fim: `${somaDias(dia, 15)}T04:00:00-03:00`, p_motivo: '[E2E]' })
    const inexistente = await eq.rpc('criar_bloqueio', { p_barbeiro_id: UUID, p_inicio: ini, p_fim: fim, p_motivo: '[E2E]' })
    log('motivo/período', { e121: e121.error?.code, e5k: e5k.error?.code, passado: passado.error?.code, longo: longo.error?.code, barbeiro: inexistente.error?.code })
    for (const r of [e121, e5k, passado, longo, inexistente]) {
      if (!r.error) bloqueios.push((r.data as { id: string }[])[0].id)
    }
    expect(e121.error?.code).toBe('URB13')
    expect(e5k.error?.code).toBe('URB13')
    expect(passado.error?.code).toBe('URB12')
    expect(longo.error?.code).toBe('URB12')
    expect(inexistente.error?.code).toBe('URB14')
  }, 60000)

  it('anon: remover_bloqueio num id REAL falha e o bloqueio continua lá', async () => {
    const dia = somaDias(hoje(), 21)
    const ok = await eq.rpc('criar_bloqueio', { p_barbeiro_id: null, p_inicio: `${dia}T03:00:00-03:00`, p_fim: `${dia}T04:00:00-03:00`, p_motivo: '[E2E] alvo' })
    expect(ok.error).toBeNull()
    const id = (ok.data as { id: string }[])[0].id
    bloqueios.push(id)
    const r = await anon.rpc('remover_bloqueio', { p_id: id })
    const del = await anon.from('bloqueios').delete().eq('id', id).select()
    log('anon remover bloqueio real', { rpc: r.error?.code, delete: del.error?.code })
    expect(r.error?.code).toBe('42501')
    const lista = await eq.rpc('listar_bloqueios', { p_de: dia, p_ate: dia })
    expect(((lista.data ?? []) as { id: string }[]).some((k) => k.id === id)).toBe(true)
  }, 60000)

  // ---------------- oráculo do anti-spam ----------------
  it('registro: URB06 revela, sem gravar nada, se um telefone já tem 2 pendentes', async () => {
    const alvo = tel()
    const a = await agendar(alvo)
    const b = await agendar(alvo)
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    const passado = '2020-01-07T13:00:00Z'
    const comPendentes = await anon.rpc('criar_agendamento', { p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: passado, p_nome: '[E2E] Sonda', p_telefone: alvo })
    const semPendentes = await anon.rpc('criar_agendamento', { p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: passado, p_nome: '[E2E] Sonda', p_telefone: tel() })
    log('oráculo URB06', { telefoneComPendentes: comPendentes.error?.code, telefoneLimpo: semPendentes.error?.code })
    expect(semPendentes.error?.code).toBe('URB05')
    // Registro do comportamento: se der URB06 aqui, a resposta distingue os dois telefones.
    expect(comPendentes.error).not.toBeNull()
  }, 90000)
})
