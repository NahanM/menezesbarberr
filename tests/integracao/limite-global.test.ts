import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, temEnvEquipe } from './clientes'

// Limite global de criações (migration 20261024120000): URB18.
//
// O PROBLEMA DE TESTAR UM LIMITE: as outras suítes criam agendamentos de verdade, ao mesmo tempo,
// no mesmo banco. Se este teste enchesse o limite real, quebraria os outros. Por isso ele usa
// teste_criar_agendamento (só equipe, só nome "Teste%"), que recebe os limites e o "agora" da
// contagem por parâmetro. Nenhum valor da tabela config é alterado.
//
// As OUTRAS suítes criam pelo mesmo caminho de teste, mas sem contar no limite (fora_do_limite):
// o limite de produção é pequeno (10/min, 30/h) e só a criação pública entra na conta. Aqui, as
// linhas A (as que precisam contar) são criadas com p_conta_no_limite = true, ou pela função pública.
//
// Como fica determinístico mesmo com testes paralelos criando linhas:
//   * Depois de criar a linha A (que conta, não cancelada), a contagem de "agora" tem pelo menos A.
//     Então limite 1 sempre dispara, aconteça o que acontecer com as outras linhas.
//   * Com "agora" daqui a 5 min (ou a 90 min), a janela de 1 min (ou de 1 h) já não pega nada
//     criado até este instante: a contagem é 0 e limite 1 sempre passa.
//   * Cada linha criada aqui nasce com nome "Teste ..." e é cancelada no fim.
// Os "agora" têm margem de minutos: relógio da máquina atrasado ou adiantado em até ~3 min
// não muda o resultado.

const TZ = 'America/Sao_Paulo'
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
const telefone = () => `116${aleatorio(8)}`
const daquiA = (minutos: number) => new Date(Date.now() + minutos * 60_000).toISOString()

/** Dias abertos (ter a sex), do mais distante da janela para o mais próximo. */
const dias = Array.from({ length: 30 }, (_, i) => somaDias(hoje(), 30 - i)).filter((d) => dow(d) >= 2 && dow(d) <= 5)

describe.skipIf(!temEnvEquipe)('limite global de criações (URB18)', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  let temFuncaoDeTeste = true
  let maxMinuto = 0
  let maxHora = 0
  const criados: string[] = []
  /** Horários já usados neste arquivo: cada criação pega um horário diferente. */
  const usados = new Set<string>()

  type Limites = { minuto: number; hora: number; agora?: string }

  /** Quando foi criada a última linha que CONTA no limite (para não depender de uma que já saiu da janela de 1 min). */
  let ultimaContada = 0
  let codigoContada = ""

  async function chamar(inicio: string, tel: string, { minuto, hora, agora }: Limites, nome = 'Teste Limite', conta = false) {
    const r = await eq.rpc('teste_criar_agendamento', {
      p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: inicio, p_nome: nome, p_telefone: tel,
      p_max_minuto: minuto, p_max_hora: hora, p_conta_no_limite: conta, ...(agora ? { p_agora: agora } : {}),
    })
    const codigo = (r.data as { codigo: string }[] | null)?.[0]?.codigo
    if (codigo) criados.push(codigo)
    return { codigo, error: r.error }
  }

  /** Horários livres de um dia (sem preferência de barbeiro), do último para o primeiro. */
  async function livres(dia: string) {
    const { data, error } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: null })
    expect(error).toBeNull()
    return ((data ?? []) as { inicio: string }[]).map((x) => x.inicio).reverse()
  }

  /**
   * Tenta criar num horário livre com os limites dados. Se o horário foi tomado por outro teste (URB05/URB07),
   * tenta o próximo. Qualquer outro erro (inclusive URB18) é devolvido ao teste.
   */
  async function criarNumLivre(limites: Limites, tel = telefone(), conta = false) {
    for (const dia of dias) {
      for (const inicio of await livres(dia)) {
        if (usados.has(inicio)) continue
        usados.add(inicio)
        const r = await chamar(inicio, tel, limites, 'Teste Limite', conta)
        if (r.error?.code === 'URB05' || r.error?.code === 'URB07') continue
        return { ...r, inicio }
      }
    }
    throw new Error('sem horário livre para o teste')
  }

  /** Garante uma linha que CONTA, criada há menos de 15 s (folga para a janela de 1 min). */
  async function garantirContada() {
    if (Date.now() - ultimaContada < 15_000) return
    const a = await criarNumLivre({ minuto: 1000, hora: 1000 }, telefone(), true)
    expect(a.error).toBeNull()
    expect(a.codigo).toBeDefined()
    ultimaContada = Date.now()
    codigoContada = a.codigo!
  }

  /** Um horário livre ainda não usado, para chamadas que NÃO devem criar nada. */
  async function umLivre() {
    for (const dia of dias) {
      for (const inicio of await livres(dia)) if (!usados.has(inicio)) return inicio
    }
    throw new Error('sem horário livre para o teste')
  }

  /** O banco não pode ter guardado nada para este telefone (a equipe lê a tabela direto). */
  async function nadaGravado(tel: string) {
    const { data, error } = await eq.from('agendamentos').select('id').eq('cliente_telefone', `55${tel}`)
    expect(error).toBeNull()
    expect(data).toEqual([])
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
    const { data } = await eq.from('config').select('max_criacoes_por_minuto, max_criacoes_por_hora').single()
    maxMinuto = data!.max_criacoes_por_minuto
    maxHora = data!.max_criacoes_por_hora
    // A função de teste pode ter sido removida (DECISOES.md): sem ela, os testes abaixo são pulados.
    const sonda = await eq.rpc('teste_criar_agendamento', {
      p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: new Date().toISOString(), p_nome: 'Sem prefixo',
      p_telefone: telefone(), p_max_minuto: 1, p_max_hora: 1,
    })
    temFuncaoDeTeste = sonda.error?.code === 'URB10'
  }, 30000)

  afterAll(async () => {
    for (const c of criados) {
      const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', c).single()
      if (ag) await eq.rpc('mudar_status', { p_id: ag.id, p_status: 'cancelado' })
    }
  }, 60000)

  it('os limites da config são plausíveis: folga para um sábado cheio, teto contra robô', () => {
    // Sábado cheio: 3 barbeiros em slots de 30 min ~ 60 agendamentos no dia; nunca todos no mesmo minuto.
    expect(maxMinuto).toBeGreaterThanOrEqual(5)
    expect(maxMinuto).toBeLessThanOrEqual(20)
    expect(maxHora).toBeGreaterThanOrEqual(maxMinuto)
    // Com a expiração de 2 h, o máximo de pendentes falsos ao mesmo tempo é ~2 x limite por hora.
    expect(maxHora).toBeLessThanOrEqual(60)
  })

  it('o fluxo normal passa pelo limite real: criar_agendamento pública cria e o código volta', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    for (const dia of dias) {
      for (const inicio of await livres(dia)) {
        if (usados.has(inicio)) continue
        usados.add(inicio)
        const r = await anon.rpc('criar_agendamento', {
          p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: inicio, p_nome: 'Teste Limite Publico', p_telefone: telefone(),
        })
        if (r.error?.code === 'URB05' || r.error?.code === 'URB07') continue
        expect(r.error).toBeNull()
        const codigo = (r.data as { codigo: string }[])[0].codigo
        expect(codigo).toMatch(/^[A-Z0-9]{6}$/)
        criados.push(codigo)
        // Esta linha é pública, portanto conta: serve de linha A para os testes seguintes.
        ultimaContada = Date.now()
        codigoContada = codigo
        const { data } = await eq.from('agendamentos').select('fora_do_limite').eq('codigo', codigo).single()
        expect(data?.fora_do_limite).toBe(false)
        return
      }
    }
    throw new Error('sem horário livre para o teste')
  }, 60000)

  it('dispara e libera: limite por minuto', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    // A: criação que conta, não cancelada.
    await garantirContada()

    // Agora o último minuto tem pelo menos A: limite 1 recusa o próximo.
    const tel = telefone()
    const bloqueado = await chamar(await umLivre(), tel, { minuto: 1, hora: 1000 })
    expect(bloqueado.error?.code).toBe('URB18')
    expect(bloqueado.codigo).toBeUndefined()
    await nadaGravado(tel)

    // A mensagem é genérica: não diz qual janela estourou, números, nem nada de A.
    const { message, details, hint } = bloqueado.error!
    const msg = JSON.stringify({ message, details, hint })
    expect(bloqueado.error?.message).toBe('Muitos pedidos agora. Tente em alguns minutos.')
    expect(msg).not.toMatch(/\d/)
    expect(msg).not.toContain(codigoContada)
    expect(msg).not.toContain('Teste')
    expect(msg).not.toMatch(/hora|limite|config/i)

    // Cinco minutos depois a janela de 1 min já não pega A: libera. A janela de 1 h ainda pega.
    const liberado = await criarNumLivre({ minuto: 1, hora: 1000, agora: daquiA(5) })
    expect(liberado.error).toBeNull()
    expect(liberado.codigo).toBeDefined()
    const telHora = telefone()
    const horaCheia = await chamar(await umLivre(), telHora, { minuto: 1000, hora: 1, agora: daquiA(5) })
    expect(horaCheia.error?.code).toBe('URB18')
    await nadaGravado(telHora)
  }, 120000)

  it('dispara e libera: limite por hora', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    await garantirContada()

    const tel = telefone()
    const bloqueado = await chamar(await umLivre(), tel, { minuto: 1000, hora: 1 })
    expect(bloqueado.error?.code).toBe('URB18')
    await nadaGravado(tel)

    // Uma hora e meia depois, nem a janela de 1 h pega A.
    const liberado = await criarNumLivre({ minuto: 1, hora: 1, agora: daquiA(90) })
    expect(liberado.error).toBeNull()
    expect(liberado.codigo).toBeDefined()
  }, 120000)

  it('linha do caminho de teste fica marcada e não conta; linha com p_conta_no_limite = true conta', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const fora = await criarNumLivre({ minuto: 1000, hora: 1000 })
    await garantirContada() // pública ou com p_conta_no_limite = true
    for (const [codigo, esperado] of [[fora.codigo, true], [codigoContada, false]] as const) {
      const { data } = await eq.from('agendamentos').select('fora_do_limite').eq('codigo', codigo!).single()
      expect(data?.fora_do_limite).toBe(esperado)
    }
  }, 60000)

  it('limite 0 recusa sempre, e a recusa vem antes de gravar qualquer coisa', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    for (const [minuto, hora] of [[0, 1000], [1000, 0]]) {
      const tel = telefone()
      const r = await chamar(await umLivre(), tel, { minuto, hora })
      expect(r.error?.code).toBe('URB18')
      await nadaGravado(tel)
    }
  }, 60000)

  it('as validações vêm antes do limite: horário inválido dá URB05 e nome inválido dá URB03, mesmo com o limite estourado', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    // URB18 só aparece para um pedido que, fora isso, seria aceito.
    const passado = await chamar('2020-01-01T13:00:00Z', telefone(), { minuto: 0, hora: 0 })
    expect(passado.error?.code).toBe('URB05')
    const longo = await chamar(await umLivre(), telefone(), { minuto: 0, hora: 0 }, `Teste${'x'.repeat(60)}`)
    expect(longo.error?.code).toBe('URB03')
  }, 60000)

  it('concorrência: pedidos em paralelo com o limite estourado recebem todos URB18 e nada é gravado', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    await garantirContada()
    const inicios: string[] = []
    for (const dia of dias) {
      for (const h of await livres(dia)) {
        if (inicios.length < 4 && !usados.has(h)) {
          usados.add(h)
          inicios.push(h)
        }
      }
      if (inicios.length >= 4) break
    }
    const tels = inicios.map(() => telefone())
    const rs = await Promise.all(inicios.map((ini, i) => chamar(ini, tels[i], { minuto: 1, hora: 1000 })))
    for (const r of rs) expect(r.error?.code).toBe('URB18')
    for (const t of tels) await nadaGravado(t)
  }, 120000)
})
