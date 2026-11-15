// Portão de segurança da Fase 2: ataques reais ao projeto Supabase do .env,
// usando só a chave pública (o que qualquer visitante copia do bundle).
// Tudo que for criado é cancelado um a um no afterAll, com a sessão da equipe.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvAnon, temEnvEquipe, url, chave } from '../integracao/clientes'

const tabelas = ['config', 'funcionamento', 'servicos', 'barbeiros', 'bloqueios', 'agendamentos', 'equipe']
const UUID = '00000000-0000-0000-0000-000000000000'

// --- datas em São Paulo (UTC-03:00 fixo, sem horário de verão) ---
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const tel = () => `119${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}`

const log = (titulo: string, r: unknown) => console.log(`[seguranca] ${titulo}: ${JSON.stringify(r)}`)

describe.skipIf(!temEnvAnon)('anon: leitura e escrita direta', () => {
  const anon = clienteAnon()

  it.each(tabelas)('select em %s vem vazio ou com erro', async (t) => {
    const { data, error } = await anon.from(t).select('*')
    log(`select ${t}`, { n: data?.length ?? null, code: error?.code })
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('schemas auth e extensions não são expostos', async () => {
    const a = await anon.schema('auth').from('users').select('*')
    const b = await anon.schema('extensions').from('pg_stat_statements').select('*')
    log('schema auth/extensions', { auth: a.error?.code, ext: b.error?.code })
    expect(a.error).not.toBeNull()
    expect(b.error).not.toBeNull()
  })

  it('enumeração de código: filtro por codigo não devolve nada', async () => {
    const { data, error } = await anon.from('agendamentos').select('codigo,cliente_nome').like('codigo', '%')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('enumeração de código: não existe RPC pública de consulta por código', async () => {
    for (const fn of ['buscar_agendamento', 'consultar_agendamento', 'agendamento_por_codigo', 'status_por_codigo']) {
      const { error } = await anon.rpc(fn, { p_codigo: 'ABCDEF' })
      expect(error).not.toBeNull()
    }
  })

  it('storage: anon não lista buckets', async () => {
    const { data, error } = await anon.storage.listBuckets()
    log('storage.listBuckets', { n: data?.length ?? null, err: error?.message })
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('OpenAPI (/rest/v1/) não lista o esquema para a chave pública', async () => {
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: chave! } })
    const corpo = await r.text()
    log('openapi', { status: r.status })
    expect(corpo).not.toMatch(/listar_agenda|cliente_telefone/)
  })

  it('GraphQL (/graphql/v1) não expõe tabelas', async () => {
    const r = await fetch(`${url}/graphql/v1`, {
      method: 'POST',
      headers: { apikey: chave!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' }),
    })
    const corpo = await r.text()
    log('graphql', { status: r.status, corpo: corpo.slice(0, 120) })
    expect(corpo).not.toMatch(/agendamentos|equipe|cliente/i)
  })
})

describe.skipIf(!temEnvAnon)('anon: funções do painel e internas', () => {
  const anon = clienteAnon()
  const chamadas: [string, Record<string, unknown>][] = [
    ['listar_agenda', { p_de: hoje(), p_ate: somaDias(hoje(), 30) }],
    ['listar_bloqueios', { p_de: hoje(), p_ate: somaDias(hoje(), 30) }],
    ['mudar_status', { p_id: UUID, p_status: 'cancelado' }],
    ['criar_bloqueio', { p_barbeiro_id: null, p_inicio: '2030-01-01T10:00:00Z', p_fim: '2030-01-01T11:00:00Z', p_motivo: 'x' }],
    ['remover_bloqueio', { p_id: UUID }],
    ['is_equipe', {}],
    ['_slots_livres', { p_duracao_min: 30, p_dia: hoje(), p_barbeiro_id: null }],
    ['_resolver_servicos', { p_servicos: ['corte'] }],
    ['_nome_servicos', { p_agendamento_id: UUID }],
    ['gerar_codigo_curto', {}],
    ['atualizar_atualizado_em', {}],
    ['validar_transicao_status', {}],
  ]
  it.each(chamadas)('rpc %s falha para anon', async (fn, args) => {
    const { data, error } = await anon.rpc(fn, args)
    log(`rpc ${fn}`, { code: error?.code, msg: error?.message?.slice(0, 80) })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('horarios_disponiveis devolve só a coluna inicio', async () => {
    let achou = false
    for (let i = 1; i <= 14 && !achou; i++) {
      const dia = somaDias(hoje(), i)
      const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia })
      const linhas = (data ?? []) as Record<string, unknown>[]
      if (linhas.length) {
        achou = true
        for (const l of linhas) expect(Object.keys(l)).toEqual(['inicio'])
      }
    }
    expect(achou).toBe(true)
  })
})

describe.skipIf(!temEnvAnon)('auth: cadastro público e login anônimo', () => {
  it('signUp não pode dar sessão nem acesso à agenda', async () => {
    const c = clienteAnon()
    const { data, error } = await c.auth.signUp({
      email: `seguranca-${Date.now()}@example.com`, password: 'Seg-Teste-98765!',
    })
    log('signUp', { erro: error?.message ?? null, criouUsuario: Boolean(data.user), sessao: Boolean(data.session) })
    if (data.session) {
      const r = await c.rpc('listar_agenda', { p_de: hoje(), p_ate: somaDias(hoje(), 30) })
      log('listar_agenda com sessão de signUp', { code: r.error?.code })
      expect(r.error).not.toBeNull()
      for (const t of tabelas) {
        const { data: linhas } = await c.from(t).select('*')
        expect(linhas ?? []).toHaveLength(0)
      }
    }
    // Registro: se signUp não deu erro, o cadastro público está LIGADO (IMPORTANTE no relatório).
    expect(data.session).toBeNull()
  })

  // signUp pode esbarrar no limite de e-mails e não provar nada; a configuração pública é a prova.
  it('cadastro público desligado no projeto (auth/v1/settings: disable_signup = true)', async () => {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave! } })
    const s = (await r.json()) as { disable_signup?: boolean; mailer_autoconfirm?: boolean; external?: { anonymous_users?: boolean } }
    log('auth settings', { disable_signup: s.disable_signup, mailer_autoconfirm: s.mailer_autoconfirm, anonimo: s.external?.anonymous_users })
    expect(s.disable_signup).toBe(true)
  })

  it('login anônimo está desligado', async () => {
    const c = clienteAnon()
    const { data, error } = await c.auth.signInAnonymously()
    log('signInAnonymously', { erro: error?.message ?? null, sessao: Boolean(data.session) })
    expect(data.session).toBeNull()
  })
})

describe.skipIf(!temEnvEquipe)('criar_agendamento com entrada maliciosa', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const criados: string[] = []

  /** teste = true: caminho de teste da equipe (fora da cota do limite global; exige nome com prefixo Teste). */
  async function agendar(o: { servico?: string; barbeiro?: string | null; inicio: string; nome?: string; tel?: string; teste?: boolean }) {
    const criar = (a: Parameters<typeof criarComoTeste>[1]) => (o.teste ? criarComoTeste(eq, a) : anon.rpc('criar_agendamento', a))
    const r = await criar({
      p_servicos: [o.servico ?? 'sobrancelha'],
      p_barbeiro: o.barbeiro === undefined ? null : o.barbeiro,
      p_inicio: o.inicio,
      p_nome: o.nome ?? 'Teste Seguranca',
      p_telefone: o.tel ?? tel(),
    })
    const linha = (r.data as { codigo: string }[] | null)?.[0]
    if (linha?.codigo) criados.push(linha.codigo)
    return { linha, error: r.error }
  }

  /** Um horário livre real (o último de um dia útil distante), para que só o campo atacado decida. */
  async function slotLivre(pular = 0): Promise<string> {
    let vistos = 0
    for (let i = 29; i >= 7; i--) {
      const dia = somaDias(hoje(), i)
      if (dow(dia) < 2 || dow(dia) > 5) continue
      const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia })
      const lista = ((data ?? []) as { inicio: string }[]).map((x) => x.inicio)
      if (lista.length && vistos++ >= pular) return lista[lista.length - 1]
    }
    throw new Error('sem horário livre')
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
  }, 30000)

  afterAll(async () => {
    let falhas = 0
    for (const codigo of criados) {
      const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
      const { error } = await eq.rpc('mudar_status', { p_id: ag?.id, p_status: 'cancelado' })
      if (error) falhas++
    }
    console.log(`[seguranca] limpeza: ${criados.length - falhas} cancelados, ${falhas} falhas`)
  }, 30000)

  it('nome com 5.000 caracteres: URB03', async () => {
    const r = await agendar({ inicio: await slotLivre(), nome: 'A'.repeat(5000) })
    log('nome 5000', { code: r.error?.code })
    expect(r.error?.code).toBe('URB03')
  })

  it('nome só com espaços/controle: URB03', async () => {
    const r = await agendar({ inicio: await slotLivre(), nome: ' \n\t\r  ' })
    expect(r.error?.code).toBe('URB03')
  })

  it('telefone com letras: URB04', async () => {
    for (const t of ['11abc999999', '1199999999x', "11999999999' or '1'='1", '+55 11 9999-ABCD']) {
      const r = await agendar({ inicio: await slotLivre(), tel: t })
      expect(r.error?.code).toBe('URB04')
    }
  })

  it('data no passado: URB05', async () => {
    let dia = somaDias(hoje(), -7)
    while (dow(dia) !== 2) dia = somaDias(dia, -1)
    const r = await agendar({ inicio: `${dia}T10:00:00-03:00` })
    log('passado', { code: r.error?.code })
    expect(r.error?.code).toBe('URB05')
  })

  it('além da janela e fora da grade: URB05', async () => {
    let dia = somaDias(hoje(), 60)
    while (dow(dia) !== 3) dia = somaDias(dia, 1)
    expect((await agendar({ inicio: `${dia}T10:00:00-03:00` })).error?.code).toBe('URB05')
    const livre = new Date(await slotLivre())
    livre.setUTCMinutes(livre.getUTCMinutes() + 7)
    expect((await agendar({ inicio: livre.toISOString() })).error?.code).toBe('URB05')
  })

  it('barbeiro inexistente ou slug com injeção: URB02', async () => {
    const inicio = await slotLivre()
    for (const b of ['joao-inexistente', "rafael' or '1'='1", UUID]) {
      expect((await agendar({ inicio, barbeiro: b })).error?.code).toBe('URB02')
    }
  })

  it('serviço com injeção: URB01', async () => {
    const r = await agendar({ inicio: await slotLivre(), servico: "corte'; drop table public.agendamentos; --" })
    expect(r.error?.code).toBe('URB01')
  })

  it('p_inicio malformado: erro de tipo, nada gravado', async () => {
    for (const inicio of ['amanhã às 10h', '2030-13-45T99:00:00Z', "now()); drop table x; --", '']) {
      const r = await agendar({ inicio })
      log(`p_inicio ${JSON.stringify(inicio)}`, { code: r.error?.code })
      expect(r.error).not.toBeNull()
      expect(r.linha).toBeUndefined()
    }
  })

  it('HTML/script no nome: registra o comportamento (gravado literal?)', async () => {
    const nome = '<script>alert(1)</script>'
    const inicio = await slotLivre()
    const r = await agendar({ inicio, nome })
    log('nome HTML', { code: r.error?.code ?? null, gravou: Boolean(r.linha) })
    if (r.linha) {
      const dia = fmt.format(new Date(inicio))
      const { data } = await eq.rpc('listar_agenda', { p_de: dia, p_ate: dia })
      const ag = ((data ?? []) as { codigo: string; cliente_nome: string }[]).find((a) => a.codigo === r.linha!.codigo)
      log('nome HTML no painel', { cliente_nome: ag?.cliente_nome })
      // Gravado literal: o banco não executa nada; quem precisa escapar é a UI (React escapa por padrão).
      expect(ag?.cliente_nome).toBe(nome)
    }
  })

  it('nome invisível (zero-width / bidi): registra o comportamento', async () => {
    const invisivel = '​​​'
    const r1 = await agendar({ inicio: await slotLivre(1), nome: invisivel })
    log('nome zero-width', { code: r1.error?.code ?? null, gravou: Boolean(r1.linha) })
    const bidi = 'Ana ‮acilbup‬'
    // O corpo que limpa o nome é o mesmo nos dois caminhos; este usa o de teste para poupar a cota do limite global.
    const r2 = await agendar({ inicio: await slotLivre(2), nome: `Teste ${bidi}`, teste: true })
    log('nome bidi RLO', { code: r2.error?.code ?? null, gravou: Boolean(r2.linha) })
    // Só registro: o resultado entra no relatório como MENOR se for aceito.
    expect(true).toBe(true)
  })
})
