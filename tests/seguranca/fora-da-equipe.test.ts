// Auditoria final: "logado, mas fora da tabela equipe" não vê nada.
//
// Pela API pública não dá para conseguir uma sessão de usuário fora da equipe:
// o signUp não devolve sessão (confirmação de e-mail ligada) e o login anônimo está desligado
// (ataque.test.ts confere os dois). Então este arquivo ataca pelos caminhos que sobram:
//   1. token JWT forjado (alg "none" e HS256 com segredo padrão de dev) com role authenticated;
//   2. token REAL da equipe com o "sub" trocado por outro usuário (assinatura original mantida);
//   3. token REAL da equipe com role trocado para service_role;
//   4. login com senha de um e-mail que não existe / não confirmado.
// Todos precisam ser recusados pelo gateway/PostgREST antes de chegar no banco.
// NÃO cria conta no Auth e NÃO grava nada.
import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { clienteAnon, clienteEquipe, temEnvAnon, temEnvEquipe, url, chave } from '../integracao/clientes'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
const log = (titulo: string, r: unknown) => console.log(`[seguranca-final] ${titulo}: ${JSON.stringify(r)}`)

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const agora = () => Math.floor(Date.now() / 1000)

function payloadFalso(extra: Record<string, unknown> = {}) {
  return {
    aud: 'authenticated',
    role: 'authenticated',
    sub: randomUUID(),
    email: 'intruso@example.com',
    iat: agora(),
    exp: agora() + 3600,
    ...extra,
  }
}

function jwtNone(payload: object) {
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.`
}

function jwtHs256(payload: object, segredo: string) {
  const corpo = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`
  return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`
}

/** Troca campos do payload de um token real, mantendo cabeçalho e assinatura originais. */
function adulterar(token: string, extra: Record<string, unknown>) {
  const [h, p, s] = token.split('.')
  const payload = { ...JSON.parse(Buffer.from(p, 'base64url').toString('utf8')), ...extra }
  return `${h}.${b64url(JSON.stringify(payload))}.${s}`
}

/** Tenta ler a agenda (RPC) e a tabela agendamentos com o token dado. */
async function tentarLer(token: string) {
  const h = { apikey: chave!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const rpc = await fetch(`${url}/rest/v1/rpc/listar_agenda`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ p_de: hoje(), p_ate: hoje() }),
  })
  const tab = await fetch(`${url}/rest/v1/agendamentos?select=cliente_nome,cliente_telefone&limit=5`, { headers: h })
  const corpoRpc = await rpc.text()
  const corpoTab = await tab.text()
  return { rpc: rpc.status, tab: tab.status, corpoRpc, corpoTab }
}

function semDadoDeCliente(r: Awaited<ReturnType<typeof tentarLer>>) {
  // Não pode ter 2xx com linhas, e o corpo não pode trazer telefone ou nome de cliente.
  expect(r.corpoRpc).not.toMatch(/cliente_telefone|55\d{10}/)
  expect(r.corpoTab).not.toMatch(/cliente_telefone"\s*:\s*"\d|cliente_nome"\s*:\s*"/)
  expect(r.rpc >= 400).toBe(true)
  expect(r.tab >= 400 || r.corpoTab.trim() === '[]').toBe(true)
}

describe.skipIf(!temEnvAnon)('logado fora da equipe: tokens forjados', () => {
  it('JWT com alg "none" e role authenticated é recusado', async () => {
    const r = await tentarLer(jwtNone(payloadFalso()))
    log('alg none', { rpc: r.rpc, tab: r.tab, msg: r.corpoRpc.slice(0, 80) })
    semDadoDeCliente(r)
  })

  it('JWT HS256 assinado com o segredo padrão do Supabase local é recusado', async () => {
    const segredo = 'super-secret-jwt-token-with-at-least-32-characters-long'
    const r = await tentarLer(jwtHs256(payloadFalso(), segredo))
    log('hs256 segredo padrão', { rpc: r.rpc, tab: r.tab, msg: r.corpoRpc.slice(0, 80) })
    semDadoDeCliente(r)
  })

  it('JWT HS256 assinado com a própria chave pública como segredo é recusado', async () => {
    const r = await tentarLer(jwtHs256(payloadFalso(), chave!))
    log('hs256 chave pública', { rpc: r.rpc, tab: r.tab })
    semDadoDeCliente(r)
  })

  it('login com senha de e-mail inexistente não dá sessão', async () => {
    const c = clienteAnon()
    const { data, error } = await c.auth.signInWithPassword({
      email: `nao-existe-${Date.now()}@example.com`,
      password: 'Qualquer-Senha-123!',
    })
    log('login inexistente', { erro: error?.message ?? null, sessao: Boolean(data.session) })
    expect(data.session).toBeNull()
  })
})

describe.skipIf(!temEnvEquipe)('logado fora da equipe: token real da equipe adulterado', () => {
  let tokenEquipe = ''

  beforeAll(async () => {
    const eq = await clienteEquipe()
    const { data } = await eq.auth.getSession()
    tokenEquipe = data.session!.access_token
  }, 30000)

  it('controle: o token real da equipe lê a agenda (prova que o ataque abaixo não é falso negativo)', async () => {
    const r = await tentarLer(tokenEquipe)
    log('controle equipe', { rpc: r.rpc, tab: r.tab })
    expect(r.rpc).toBe(200)
    expect(r.tab).toBe(200)
  })

  it('token da equipe com "sub" de outro usuário (fora da equipe) é recusado', async () => {
    const r = await tentarLer(adulterar(tokenEquipe, { sub: randomUUID(), email: 'intruso@example.com' }))
    log('sub trocado', { rpc: r.rpc, tab: r.tab, msg: r.corpoRpc.slice(0, 80) })
    semDadoDeCliente(r)
  })

  it('token da equipe com role service_role é recusado', async () => {
    const r = await tentarLer(adulterar(tokenEquipe, { role: 'service_role' }))
    log('role service_role', { rpc: r.rpc, tab: r.tab, msg: r.corpoRpc.slice(0, 80) })
    semDadoDeCliente(r)
  })

  it('token da equipe com exp estendido é recusado', async () => {
    const r = await tentarLer(adulterar(tokenEquipe, { exp: agora() + 10 * 365 * 24 * 3600 }))
    log('exp estendido', { rpc: r.rpc, tab: r.tab })
    semDadoDeCliente(r)
  })
})
