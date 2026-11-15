import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvEquipe } from './clientes'

// Pendente que ninguém confirma expira (migration 20261024100000).
//
// Como simular "criado há mais de 2 h" sem service_role: a função teste_envelhecer_agendamento
// (migration 20261024100100) recua o criado_em de um agendamento. Ela só vale para quem é da equipe e
// só para clientes cujo nome começa com "Teste". A alternativa de encurtar o prazo na tabela config
// não serve: a API não escreve em config, e um prazo curto expiraria também os pendentes dos outros
// testes que rodam em paralelo no mesmo banco.
//
// Usa o barbeiro 'rafael' e o serviço 'sobrancelha' (15 min) nos últimos dias abertos da janela,
// para disputar o mínimo possível com os outros arquivos de integração.

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
const telefone = () => `118${aleatorio(8)}`

/** Dias abertos (ter a sex), do mais distante da janela para o mais próximo. */
const dias = Array.from({ length: 30 }, (_, i) => somaDias(hoje(), 30 - i)).filter((d) => dow(d) >= 2 && dow(d) <= 5)

describe.skipIf(!temEnvEquipe)('expiração de pendentes', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  let prazo = 120
  let maxPendentes = 2
  let temFuncaoDeTeste = true
  const criados: string[] = []

  async function horarios(dia: string) {
    const { data, error } = await anon.rpc('horarios_disponiveis', {
      p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: 'rafael',
    })
    expect(error).toBeNull()
    return ((data ?? []) as { inicio: string }[]).map((r) => r.inicio)
  }
  async function agendar(inicio: string, tel = telefone(), nome = 'Teste Expira') {
    // Pelo caminho de teste (mesmo corpo da função pública, mas fora da cota do limite global).
    const r = await criarComoTeste(eq, {
      p_servicos: ['sobrancelha'], p_barbeiro: 'rafael', p_inicio: inicio, p_nome: nome, p_telefone: tel,
    })
    const linha = (r.data as { codigo: string }[] | null)?.[0]
    if (linha?.codigo) criados.push(linha.codigo)
    return { codigo: linha?.codigo, error: r.error }
  }
  /** Cria um pendente num horário livre qualquer (tenta o próximo se alguém ocupar na frente). */
  async function reservar(tel = telefone()) {
    for (const dia of dias) {
      for (const inicio of (await horarios(dia)).reverse()) {
        const r = await agendar(inicio, tel)
        if (r.codigo) return { codigo: r.codigo, inicio, dia }
        if (r.error?.code !== 'URB05' && r.error?.code !== 'URB07') throw new Error(`reservar: ${r.error?.message}`)
      }
    }
    throw new Error('sem horário livre para o teste')
  }
  async function envelhecer(codigo: string, minutos: number) {
    const r = await eq.rpc('teste_envelhecer_agendamento', { p_codigo: codigo, p_minutos: minutos })
    expect(r.error).toBeNull()
    expect(r.data).toBe(1)
  }
  async function linha(codigo: string, dia: string) {
    const { data, error } = await eq.rpc('listar_agenda', { p_de: dia, p_ate: dia })
    expect(error).toBeNull()
    const l = (data as { codigo: string; status: string; expirado_em: string | null }[]).find((x) => x.codigo === codigo)
    expect(l).toBeDefined()
    return l!
  }
  async function mudar(codigo: string, status: string) {
    const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
    return eq.rpc('mudar_status', { p_id: ag?.id, p_status: status })
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
    const { data } = await eq.from('config').select('expira_pendente_min, max_pendentes_por_telefone').single()
    prazo = data!.expira_pendente_min
    maxPendentes = data!.max_pendentes_por_telefone
    expect(prazo).toBeGreaterThanOrEqual(5)
    expect(prazo + 1).toBeLessThanOrEqual(1440) // o limite de teste_envelhecer_agendamento
    // A função de teste pode ter sido removida do banco (DECISOES.md): sem ela, os testes abaixo são pulados.
    const sonda = await eq.rpc('teste_envelhecer_agendamento', { p_codigo: 'ZZZZZZ', p_minutos: 0 })
    temFuncaoDeTeste = sonda.error?.code === 'URB10'
  }, 30000)

  afterAll(async () => {
    for (const c of criados) await mudar(c, 'cancelado')
  }, 60000)

  it('pendente dentro do prazo continua ocupando o horário', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    await envelhecer(r.codigo, prazo - 5) // faltam 5 min para vencer
    expect(await horarios(r.dia)).not.toContain(r.inicio)
    expect((await agendar(r.inicio)).error?.code).toBe('URB05')
    expect((await linha(r.codigo, r.dia)).status).toBe('pendente')
  }, 60000)

  it('pendente vencido: o horário volta a aparecer, aceita agendamento novo e o vencido vira cancelado com expirado_em', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    expect(await horarios(r.dia)).not.toContain(r.inicio)
    await envelhecer(r.codigo, prazo + 1)

    // Leitura só ignora: horarios_disponiveis é stable e não grava nada.
    expect(await horarios(r.dia)).toContain(r.inicio)
    const antes = await linha(r.codigo, r.dia)
    expect(antes.status).toBe('pendente')
    expect(antes.expirado_em).toBeNull()

    // Escrita (criar_agendamento) expira o vencido antes do insert: sem exclusion_violation.
    const novo = await agendar(r.inicio)
    expect(novo.error).toBeNull()
    expect(novo.codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)

    const depois = await linha(r.codigo, r.dia)
    expect(depois.status).toBe('cancelado')
    expect(depois.expirado_em).not.toBeNull()
    expect(await horarios(r.dia)).not.toContain(r.inicio) // agora é o novo que ocupa
  }, 90000)

  it('cancelar na mão não marca expirado_em', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    expect((await mudar(r.codigo, 'cancelado')).error).toBeNull()
    const l = await linha(r.codigo, r.dia)
    expect(l.status).toBe('cancelado')
    expect(l.expirado_em).toBeNull()
  }, 60000)

  it('pendente vencido não conta no limite por telefone (URB06)', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const tel = telefone()
    const primeiro = await reservar(tel)
    // Completa o limite com pendentes novos do mesmo telefone, em horários livres.
    let n = 1
    for (const inicio of (await horarios(primeiro.dia)).reverse()) {
      if (n >= maxPendentes) break
      if ((await agendar(inicio, tel)).codigo) n++
    }
    expect(n).toBe(maxPendentes)

    // Controle: no limite, o próximo dá URB06.
    const restantes = (await horarios(primeiro.dia)).reverse()
    expect(restantes.length).toBeGreaterThan(0)
    expect((await agendar(restantes[0], tel)).error?.code).toBe('URB06')

    // O primeiro vence: sai da conta e o telefone volta a poder agendar.
    await envelhecer(primeiro.codigo, prazo + 1)
    const livre = await agendar(restantes[0], tel)
    expect(livre.error).toBeNull()
    expect(livre.codigo).toBeDefined()
  }, 120000)

  it('confirmado nunca expira (espera o prazo passar de verdade, ~1 min)', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    // A função de teste só mexe em pendente, então: recua até 1 min antes de vencer, confirma e deixa o relógio passar.
    await envelhecer(r.codigo, prazo - 1)
    expect((await mudar(r.codigo, 'confirmado')).error).toBeNull()
    await new Promise((ok) => setTimeout(ok, 62_000))

    expect(await horarios(r.dia)).not.toContain(r.inicio)
    expect((await agendar(r.inicio)).error?.code).toBe('URB05') // a expiração preguiçosa passou por aqui sem tocar nele
    const l = await linha(r.codigo, r.dia)
    expect(l.status).toBe('confirmado')
    expect(l.expirado_em).toBeNull()
  }, 120000)

  it('a função de teste não envelhece confirmado', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    expect((await mudar(r.codigo, 'confirmado')).error).toBeNull()
    const res = await eq.rpc('teste_envelhecer_agendamento', { p_codigo: r.codigo, p_minutos: prazo + 1 })
    expect(res.error).toBeNull()
    expect(res.data).toBe(0)
  }, 60000)

  it('mudar_status num pendente vencido: expira em vez de confirmar e libera o horário', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    await envelhecer(r.codigo, prazo + 1)
    const res = await mudar(r.codigo, 'confirmado')
    expect(res.error).toBeNull()
    const l = (res.data as { status: string; expirado_em: string | null }[])[0]
    expect(l.status).toBe('cancelado') // o pedido de "confirmado" NÃO foi aplicado
    expect(l.expirado_em).not.toBeNull()
    // A expiração ficou gravada (não houve rollback): a agenda já mostra cancelado e o horário está livre.
    expect((await linha(r.codigo, r.dia)).status).toBe('cancelado')
    expect(await horarios(r.dia)).toContain(r.inicio)
  }, 60000)

  it('mudar_status "cancelado" num pendente vencido termina cancelado, sem erro', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    await envelhecer(r.codigo, prazo + 1)
    const res = await mudar(r.codigo, 'cancelado')
    expect(res.error).toBeNull()
    expect((res.data as { status: string }[])[0].status).toBe('cancelado')
  }, 60000)

  it('criar_bloqueio não conta pendente vencido nos conflitos', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    const fim = new Date(new Date(r.inicio).getTime() + 15 * 60_000).toISOString()
    const { data: rafael } = await eq.from('barbeiros').select('id').eq('slug', 'rafael').single()
    const bloquear = async () => {
      const b = await eq.rpc('criar_bloqueio', { p_barbeiro_id: rafael!.id, p_inicio: r.inicio, p_fim: fim, p_motivo: 'Teste expiração' })
      expect(b.error).toBeNull()
      const { id, conflitos } = (b.data as { id: string; conflitos: number }[])[0]
      await eq.rpc('remover_bloqueio', { p_id: id })
      return conflitos
    }
    expect(await bloquear()).toBe(1) // controle: dentro do prazo, o pendente conta
    await envelhecer(r.codigo, prazo + 1)
    expect(await bloquear()).toBe(0)
  }, 60000)

  it('vencido já substituído não pode mais ser confirmado', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    const r = await reservar()
    await envelhecer(r.codigo, prazo + 1)
    expect((await agendar(r.inicio)).error).toBeNull() // expira o vencido e ocupa o horário
    const c = await mudar(r.codigo, 'confirmado')
    expect(c.error?.code).toBe('23514') // cancelado -> confirmado é transição inválida
  }, 60000)

  it('teste_envelhecer_agendamento valida os argumentos', async (ctx) => {
    if (!temFuncaoDeTeste) return ctx.skip()
    expect((await eq.rpc('teste_envelhecer_agendamento', { p_codigo: 'ZZZZZZ', p_minutos: 0 })).error?.code).toBe('URB10')
    expect((await eq.rpc('teste_envelhecer_agendamento', { p_codigo: 'ZZZZZZ', p_minutos: 1441 })).error?.code).toBe('URB10')
    expect((await eq.rpc('teste_envelhecer_agendamento', { p_codigo: 'ZZZZZZ', p_minutos: 5 })).data).toBe(0)
  })
})
