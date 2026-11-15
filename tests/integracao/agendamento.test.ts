import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, criarComoTeste, temEnvEquipe } from './clientes'

// Funcionamento do seed: ter-sex 09:00-20:00, sab 09:00-18:00, almoço 12:00-13:00,
// seg e dom fechados. Grade 30 min, antecedência 60 min, janela 30 dias, 2 pendentes.
// Serviços usados: corte (40 min), barba (30 min), sobrancelha (15 min).
// Brasil não tem horário de verão desde 2019: São Paulo é sempre UTC-03:00.

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
const hhmm = (iso: string) => partes(new Date(iso)).hora
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const hoje = () => partes(new Date()).dia
const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
const telefone = () => `119${aleatorio(8)}`

/** Dias abertos ter-sex, a partir de 7 dias à frente (dentro da janela de 30). */
function diasUteis(qtd: number) {
  const out: string[] = []
  for (let i = 7; i <= 30 && out.length < qtd; i++) {
    const d = somaDias(hoje(), i)
    if (dow(d) >= 2 && dow(d) <= 5) out.push(d)
  }
  return out
}
function proximo(dowAlvo: number, minOffset: number, maxOffset: number) {
  for (let i = minOffset; i <= maxOffset; i++) {
    const d = somaDias(hoje(), i)
    if (dow(d) === dowAlvo) return d
  }
  throw new Error('sem dia')
}

describe.skipIf(!temEnvEquipe)('agendamento: regras no servidor', () => {
  const anon = clienteAnon()
  let eq: SupabaseClient
  const criados: string[] = []
  const dias = diasUteis(10)

  async function horarios(servico: string, dia: string, barbeiro: string | null = null) {
    const { data, error } = await anon.rpc('horarios_disponiveis', {
      p_servicos: [servico], p_dia: dia, p_barbeiro: barbeiro,
    })
    return { data: ((data ?? []) as { inicio: string }[]).map((r) => r.inicio), error }
  }
  async function agendar(o: {
    servico?: string; barbeiro?: string | null; inicio: string; nome?: string; tel?: string
    /** true = pela função pública (conta no limite global). Padrão: caminho de teste, que não conta. */
    publico?: boolean
  }) {
    const args = {
      p_servicos: [o.servico ?? 'corte'],
      p_barbeiro: o.barbeiro === undefined ? null : o.barbeiro,
      p_inicio: o.inicio,
      p_nome: o.nome ?? 'Teste QA',
      p_telefone: o.tel ?? telefone(),
    }
    const r = o.publico ? await anon.rpc('criar_agendamento', args) : await criarComoTeste(eq, args)
    const linha = (r.data as { codigo: string; barbeiro_nome: string }[] | null)?.[0]
    if (linha?.codigo) criados.push(linha.codigo)
    return { linha, error: r.error }
  }
  const todos = diasUteis(30)
  /** Procura, nos dias abertos da janela, um dia em que o início hh:mm (SP) esteja livre. */
  async function acharSlot(servico: string, hm: string) {
    for (const dia of todos) {
      const inicio = (await horarios(servico, dia)).data.find((i) => hhmm(i) === hm)
      if (inicio) return { dia, inicio }
    }
    return null
  }
  /** Primeiro dia aberto da janela com pelo menos `min` horários livres. */
  async function diaCom(servico: string, min = 1, barbeiro: string | null = null) {
    for (const dia of todos) {
      const slots = (await horarios(servico, dia, barbeiro)).data
      if (slots.length >= min) return { dia, slots }
    }
    throw new Error('nenhum dia da janela com horários livres suficientes')
  }
  const slotLocal = (dia: string, hm: string) => `${dia}T${hm}:00-03:00`

  /** Troca o status pela RPC mudar_status (o painel não faz update direto). */
  async function mudar(codigo: string, status: string) {
    const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
    return eq.rpc('mudar_status', { p_id: ag?.id, p_status: status })
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
    expect(dias.length).toBeGreaterThanOrEqual(8)
  }, 30000)

  afterAll(async () => {
    // Um a um: se um estiver em estado final (concluido), o trigger recusa só ele.
    let falhas = 0
    for (const codigo of criados) {
      const { error } = await mudar(codigo, 'cancelado')
      if (error) falhas++
    }
    console.log(`limpeza: ${criados.length - falhas} cancelados, ${falhas} não canceláveis (estado final)`)
  }, 30000)

  describe('fechamento', () => {
    it('barba (30 min) termina exatamente às 20:00: se 19:30 está livre em algum dia, é aceita', async (ctx) => {
      // Invariante: nenhum início oferecido passa das 19:30.
      const { data } = await horarios('barba', dias[0])
      for (const i of data) expect(hhmm(i) <= '19:30').toBe(true)
      const achado = await acharSlot('barba', '19:30')
      if (!achado) return ctx.skip('nenhum dia da janela com 19:30 livre para barba')
      const { linha, error } = await agendar({ servico: 'barba', inicio: achado.inicio })
      expect(error).toBeNull()
      expect(linha?.codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    }, 90000)

    it('1 minuto além do fechamento (barba 19:31) é recusado', async () => {
      const { error } = await agendar({ servico: 'barba', inicio: slotLocal(dias[0], '19:31') })
      expect(error?.code).toBe('URB05')
    }, 30000)

    it('corte (40 min): 19:30 (termina 20:10) nunca é oferecido nem aceito; último início <= 19:00', async () => {
      for (const dia of dias.slice(0, 3)) {
        const h = (await horarios('corte', dia)).data.map(hhmm)
        expect(h).not.toContain('19:30')
        for (const x of h) expect(x <= '19:00').toBe(true)
      }
      const { error } = await agendar({ servico: 'corte', inicio: slotLocal(dias[0], '19:30') })
      expect(error?.code).toBe('URB05')
    }, 30000)

    it('corte às 19:00 (termina 19:40) é aceito quando livre', async (ctx) => {
      const achado = await acharSlot('corte', '19:00')
      if (!achado) return ctx.skip('nenhum dia da janela com 19:00 livre para corte')
      const { error } = await agendar({ servico: 'corte', inicio: achado.inicio })
      expect(error).toBeNull()
    }, 90000)

    it('sábado fecha 18:00: nenhum início de barba depois de 17:30', async () => {
      const sab = proximo(6, 7, 30)
      for (const i of (await horarios('barba', sab)).data) expect(hhmm(i) <= '17:30').toBe(true)
    }, 30000)
  })

  describe('almoço (12:00 a 13:00)', () => {
    it('corte (40 min): 11:30, 12:00 e 12:30 nunca aparecem; 11:00 e 13:00 são aceitos quando livres', async (ctx) => {
      for (const dia of dias.slice(0, 3)) {
        const h = (await horarios('corte', dia)).data.map(hhmm)
        for (const x of ['11:30', '12:00', '12:30']) expect(h).not.toContain(x)
      }
      for (const hm of ['11:00', '13:00']) {
        const achado = await acharSlot('corte', hm)
        if (!achado) return ctx.skip(`nenhum dia com ${hm} livre`)
        expect((await agendar({ servico: 'corte', inicio: achado.inicio })).error).toBeNull()
      }
    }, 120000)

    it('barba (30 min): 12:00 e 12:30 nunca aparecem; 11:30 (termina 12:00 exato) é aceito quando livre', async (ctx) => {
      for (const dia of dias.slice(0, 3)) {
        const h = (await horarios('barba', dia)).data.map(hhmm)
        expect(h).not.toContain('12:00')
        expect(h).not.toContain('12:30')
      }
      const achado = await acharSlot('barba', '11:30')
      if (!achado) return ctx.skip('nenhum dia com 11:30 livre para barba')
      expect((await agendar({ servico: 'barba', inicio: achado.inicio })).error).toBeNull()
    }, 90000)

    it('criar no horário que cruza o almoço é recusado', async () => {
      for (const hm of ['11:30', '12:00', '12:30']) {
        const { error } = await agendar({ servico: 'corte', inicio: slotLocal(dias[1], hm) })
        expect(error?.code, hm).toBe('URB05')
      }
    }, 30000)
  })

  describe('dia, passado, antecedência e janela', () => {
    it('domingo e segunda: lista vazia e criar recusa', async () => {
      for (const alvo of [0, 1]) {
        const d = proximo(alvo, 7, 30)
        expect((await horarios('corte', d)).data).toEqual([])
        const { error } = await agendar({ inicio: slotLocal(d, '10:00') })
        expect(error?.code).toBe('URB05')
      }
    }, 30000)

    it('dia passado: vazio e criar recusa', async () => {
      const ontem = somaDias(hoje(), -1)
      expect((await horarios('corte', ontem)).data).toEqual([])
      const { error } = await agendar({ inicio: slotLocal(somaDias(hoje(), -2), '10:00') })
      expect(error?.code).toBe('URB05')
    }, 30000)

    it('hoje: nada antes de agora + 60 min; criar em < 60 min é recusado', async () => {
      const { data, error } = await horarios('corte', hoje())
      expect(error).toBeNull()
      const limite = Date.now() + 60 * 60 * 1000
      for (const i of data) expect(new Date(i).getTime()).toBeGreaterThanOrEqual(limite)
      // próximo ponto da grade de 30 min a partir de agora (< 60 min à frente, ou já passado)
      const meia = 30 * 60 * 1000
      const prox = new Date(Math.ceil((Date.now() + 1000) / meia) * meia)
      const r1 = await agendar({ inicio: prox.toISOString() })
      expect(r1.error?.code).toBe('URB05')
      const r2 = await agendar({ inicio: new Date(Date.now() - 3600_000).toISOString() })
      expect(r2.error?.code).toBe('URB05')
    }, 30000)

    it('além da janela (hoje + 31 dias): vazio e criar recusa', async () => {
      const d = proximo(3, 31, 38)
      expect((await horarios('corte', d)).data).toEqual([])
      const { error } = await agendar({ inicio: slotLocal(d, '10:00') })
      expect(error?.code).toBe('URB05')
    }, 30000)

    it('dentro da janela (hoje + 30 dias): consulta não dá erro', async () => {
      const { error } = await horarios('corte', somaDias(hoje(), 30))
      expect(error).toBeNull()
    }, 30000)
  })

  describe('concorrência', () => {
    it('mesmo barbeiro e horário: o segundo falha com URB05 ou URB07', async () => {
      const { dia, slots: livres } = await diaCom('corte', 1, 'rafael')
      const slot = livres[0]
      const a = await agendar({ barbeiro: 'rafael', inicio: slot })
      expect(a.error).toBeNull()
      expect(a.linha?.barbeiro_nome).toBe('Rafael')
      const b = await agendar({ barbeiro: 'rafael', inicio: slot })
      expect(['URB05', 'URB07']).toContain(b.error?.code)
      // e o horário sumiu da lista do Rafael
      expect((await horarios('corte', dia, 'rafael')).data).not.toContain(slot)
    }, 30000)

    it('chamadas simultâneas: exatamente uma vence', async () => {
      const { slots } = await diaCom('corte', 1, 'diego')
      const slot = slots.at(-1)!
      const [x, y] = await Promise.all([
        agendar({ barbeiro: 'diego', inicio: slot }),
        agendar({ barbeiro: 'diego', inicio: slot }),
      ])
      const ok = [x, y].filter((r) => !r.error)
      const falhas = [x, y].filter((r) => r.error)
      expect(ok).toHaveLength(1)
      expect(falhas).toHaveLength(1)
      expect(['URB05', 'URB07']).toContain(falhas[0].error?.code)
    }, 30000)
  })

  describe('sem preferência', () => {
    it('com dois barbeiros ocupados, escolhe o terceiro', async () => {
      // dia em que algum horário está livre para os três barbeiros ao mesmo tempo
      let dia = ''
      let slot = ''
      for (const d of todos) {
        const [r, di, c] = await Promise.all(['rafael', 'diego', 'caio'].map((b) => horarios('corte', d, b)))
        const comum = r.data.find((x) => di.data.includes(x) && c.data.includes(x))
        if (comum) { dia = d; slot = comum; break }
      }
      expect(slot, 'nenhum horário livre para os 3 barbeiros na janela').not.toBe('')
      expect((await agendar({ barbeiro: 'rafael', inicio: slot })).error).toBeNull()
      expect((await agendar({ barbeiro: 'diego', inicio: slot })).error).toBeNull()
      // horário ainda é oferecido sem preferência (Caio livre)
      expect((await horarios('corte', dia)).data).toContain(slot)
      const { linha, error } = await agendar({ barbeiro: null, inicio: slot })
      expect(error).toBeNull()
      expect(linha?.barbeiro_nome).toBe('Caio')
      // agora todos ocupados: some da lista e recusa
      expect((await horarios('corte', dia)).data).not.toContain(slot)
      const ultimo = await agendar({ barbeiro: null, inicio: slot })
      expect(ultimo.error?.code).toBe('URB05')
    }, 60000)
  })

  describe('limite de pendentes por telefone', () => {
    it('o terceiro pendente do mesmo telefone dá URB06', async () => {
      const tel = telefone()
      const { slots } = await diaCom('sobrancelha', 4)
      expect((await agendar({ servico: 'sobrancelha', inicio: slots[0], tel })).error).toBeNull()
      expect((await agendar({ servico: 'sobrancelha', inicio: slots[1], tel })).error).toBeNull()
      const terceiro = await agendar({ servico: 'sobrancelha', inicio: slots[2], tel })
      expect(terceiro.error?.code).toBe('URB06')
      // telefone formatado diferente, mesmo número: também conta
      const fmtd = `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`
      const quarto = await agendar({ servico: 'sobrancelha', inicio: slots[2], tel: fmtd })
      expect(quarto.error?.code).toBe('URB06')
      // mesmo número com 55 na frente (forma canônica): também conta
      const com55 = await agendar({ servico: 'sobrancelha', inicio: slots[2], tel: `+55${tel}` })
      expect(com55.error?.code).toBe('URB06')
      // outro telefone no mesmo horário livre passa
      expect((await agendar({ servico: 'sobrancelha', inicio: slots[2] })).error).toBeNull()
    }, 60000)

    /** Regras reais do remoto (config e funcionamento), para o teste não depender do seed. */
    async function regras() {
      const { data: cfg } = await eq.from('config').select('*').single()
      const { data: func } = await eq.from('funcionamento').select('*')
      expect(cfg, 'config legível pela equipe').toBeTruthy()
      return { cfg: cfg as { janela_max_dias: number; max_pendentes_por_telefone: number },
        func: (func ?? []) as { dia_semana: number; abre: string; fecha: string; almoco_inicio: string | null; almoco_fim: string | null }[] }
    }
    const hm = (t: string) => t.slice(0, 5)
    const minutos = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    it('telefone no limite + horário inválido devolve o erro do horário, não URB06 (não vaza pendentes)', async () => {
      const { cfg, func } = await regras()
      const max = cfg.max_pendentes_por_telefone
      const tel = telefone()
      const nome = 'Teste Limite depois do horario'
      const { dia, slots } = await diaCom('sobrancelha', max + 2)
      for (let i = 0; i < max; i++) {
        expect((await agendar({ servico: 'sobrancelha', inicio: slots[i], tel, nome })).error).toBeNull()
      }
      // controle: pedido válido com o telefone no limite continua dando URB06
      expect((await agendar({ servico: 'sobrancelha', inicio: slots[max], tel, nome })).error?.code).toBe('URB06')

      const f = func.find((x) => x.dia_semana === dow(dia))!
      const fechado = Array.from({ length: 14 }, (_, i) => somaDias(hoje(), i + 1))
        .find((d) => d <= somaDias(hoje(), cfg.janela_max_dias) && !func.some((x) => x.dia_semana === dow(d)))
      const invalidos: Record<string, string> = {
        passado: slotLocal(somaDias(hoje(), -1), '10:00'),
        'depois da janela': slotLocal(somaDias(hoje(), cfg.janela_max_dias + 1), '10:00'),
        'antes de abrir': slotLocal(dia, deMinutos(minutos(f.abre) - 60)),
        // sobrancelha dura 15 min: começar 5 min antes do fechamento não cabe
        'não cabe antes de fechar': slotLocal(dia, deMinutos(minutos(f.fecha) - 5)),
      }
      if (f.almoco_inicio) invalidos['no almoço'] = slotLocal(dia, hm(f.almoco_inicio))
      if (fechado) invalidos['dia fechado'] = slotLocal(fechado, '10:00')
      for (const [motivo, inicio] of Object.entries(invalidos)) {
        const r = await agendar({ servico: 'sobrancelha', inicio, tel, nome })
        expect(r.error?.code, motivo).toBe('URB05')
      }
      // barbeiro inexistente também vem antes do limite
      const sem = await agendar({ servico: 'sobrancelha', barbeiro: 'nao-existe', inicio: slots[max], tel, nome })
      expect(sem.error?.code).toBe('URB02')
      // um telefone SEM pendentes recebe exatamente o mesmo erro: o anônimo não distingue os dois
      const limpo = await agendar({ servico: 'sobrancelha', inicio: invalidos.passado, nome })
      expect(limpo.error?.code).toBe('URB05')
    }, 120000)

    it('concorrência: 3 pedidos paralelos do mesmo telefone com 1 vaga restante: 1 passa, 2 dão URB06', async () => {
      const { cfg } = await regras()
      const max = cfg.max_pendentes_por_telefone
      const tel = telefone()
      const nome = 'Teste Concorrencia limite'
      const { slots } = await diaCom('sobrancelha', max + 2)
      for (let i = 0; i < max - 1; i++) {
        expect((await agendar({ servico: 'sobrancelha', inicio: slots[i], tel, nome })).error).toBeNull()
      }
      const alvo = slots.slice(max - 1, max + 2)
      const rs = await Promise.all(alvo.map((inicio) => agendar({ servico: 'sobrancelha', inicio, tel, nome })))
      expect(rs.filter((r) => !r.error)).toHaveLength(1)
      expect(rs.filter((r) => r.error?.code === 'URB06')).toHaveLength(2)
    }, 120000)
  })


  describe('fuso America/Sao_Paulo', () => {
    it('horários devolvidos caem no dia pedido e dentro do funcionamento', async () => {
      for (const dia of [dias[5], proximo(6, 7, 30)]) {
        // dia lotado devolveria vazio; o que vale é que nada devolvido escape do dia/expediente
        const fecha = dow(dia) === 6 ? '18:00' : '20:00'
        const { data } = await horarios('sobrancelha', dia)
        for (const i of data) {
          expect(diaSP(i)).toBe(dia)
          const h = hhmm(i)
          expect(h >= '09:00' && h < fecha, `${i} -> ${h}`).toBe(true)
        }
      }
    }, 30000)

    it('perto da meia-noite local: recusa 23:30 SP, 00:30 SP e instantes UTC que viram outro dia', async () => {
      const dia = dias[5]
      const proximoDia = somaDias(dia, 1)
      const alvos = [
        slotLocal(dia, '23:30'),
        slotLocal(proximoDia, '00:30'),
        `${proximoDia}T01:00:00Z`, // 22:00 SP do dia anterior, depois do fechamento
        `${proximoDia}T02:30:00Z`, // 23:30 SP
        `${dia}T11:00:00Z`, // 08:00 SP, antes de abrir
      ]
      for (const a of alvos) {
        const { error } = await agendar({ inicio: a })
        expect(error?.code, a).toBe('URB05')
      }
    }, 60000)

    it('instante expresso em UTC equivale ao horário local', async () => {
      const { dia, slots } = await diaCom('sobrancelha')
      const slot = slots[0]
      const utc = new Date(slot).toISOString()
      // o instante em UTC, convertido de volta para SP, cai no mesmo dia e hora
      expect(diaSP(utc)).toBe(dia)
      expect(hhmm(utc)).toBe(hhmm(slot))
      const { error } = await agendar({ servico: 'sobrancelha', inicio: utc })
      expect(error).toBeNull()
    }, 30000)
  })

  describe('anônimo não lê dados de clientes', () => {
    it('select direto em agendamentos: erro ou vazio, sem nome nem telefone', async () => {
      const { data, error } = await anon.from('agendamentos').select('cliente_nome, cliente_telefone')
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })

    it('horarios_disponiveis devolve só a coluna inicio', async () => {
      const { dia } = await diaCom('corte')
      const r = await anon.rpc('horarios_disponiveis', { p_servicos: ['corte'], p_dia: dia, p_barbeiro: null })
      expect(r.error).toBeNull()
      const linhas = r.data as Record<string, unknown>[]
      expect(linhas.length).toBeGreaterThan(0)
      for (const l of linhas) expect(Object.keys(l)).toEqual(['inicio'])
    }, 30000)

    it('um agendamento existente não vaza por select, nem pelo código', async () => {
      const slot = (await diaCom('corte')).slots[0]
      const nome = `Teste Segredo ${aleatorio(6)}`
      const { error } = await agendar({ inicio: slot, nome })
      expect(error).toBeNull()
      const { data } = await anon.from('agendamentos').select('*').eq('cliente_nome', nome)
      expect(data ?? []).toEqual([])
    }, 30000)
  })

  describe('validação de entrada', () => {
    let slot: string
    beforeAll(async () => {
      slot = (await diaCom('corte')).slots[0]
    }, 30000)

    const nomeCom = (n: number) => 'A'.repeat(n)
    it.each([
      ['nome com 1 caractere', { nome: 'A' }, 'URB03'],
      ['nome com 61 caracteres', { nome: nomeCom(61) }, 'URB03'],
      ['nome só com espaços', { nome: '     ' }, 'URB03'],
      ['telefone com letras', { tel: '11 9999a9999' }, 'URB04'],
      ['telefone com 9 dígitos', { tel: '119999999' }, 'URB04'],
      ['telefone com 14 dígitos', { tel: '11999999999999' }, 'URB04'],
      ['telefone com 12 dígitos sem 55', { tel: '119999999999' }, 'URB04'],
      ['nome só com quebras de linha e 1 letra', { nome: 'A\n\n' }, 'URB03'],
      ['serviço inexistente', { servico: 'nao-existe' }, 'URB01'],
      ['barbeiro inexistente', { barbeiro: 'nao-existe' }, 'URB02'],
    ])('%s é recusado', async (_t, extra, codigo) => {
      // Pela função pública: a validação de entrada é dela (e nenhum destes casos chega a criar linha).
      const { error } = await agendar({ inicio: slot, publico: true, ...(extra as object) })
      expect(error?.code).toBe(codigo)
    }, 30000)

    it('horarios_disponiveis com slug inexistente dá erro (URB01 / URB02)', async () => {
      expect((await horarios('nao-existe', dias[8])).error?.code).toBe('URB01')
      expect((await horarios('corte', dias[8], 'nao-existe')).error?.code).toBe('URB02')
    }, 30000)

    it('nome com 60 caracteres e telefone formatado são aceitos', async () => {
      const t = telefone()
      const { error } = await agendar({
        // 60 caracteres exatos (começando com Teste, exigido pelo caminho de teste, que não gasta cota do limite global).
        inicio: slot, nome: `Teste${nomeCom(55)}`, tel: `+55 (${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`,
      })
      // 55 + 11 dígitos = 13 dígitos: no limite superior
      expect(error).toBeNull()
    }, 30000)
  })

  describe('máquina de estados (sessão da equipe)', () => {
    async function criarPendente() {
      const slot = (await diaCom('sobrancelha')).slots.at(-1)!
      const { linha, error } = await agendar({ servico: 'sobrancelha', inicio: slot })
      expect(error).toBeNull()
      return linha!.codigo
    }

    it('cancelado -> pendente é recusado', async () => {
      const codigo = await criarPendente()
      const c = await mudar(codigo, 'cancelado')
      expect(c.error).toBeNull()
      expect(c.data).toHaveLength(1)
      const volta = await mudar(codigo, 'pendente')
      expect(volta.error).not.toBeNull()
      const { data } = await eq.from('agendamentos').select('status').eq('codigo', codigo).single()
      expect(data?.status).toBe('cancelado')
    }, 30000)

    it('pendente -> concluido é recusado', async () => {
      const codigo = await criarPendente()
      const r = await mudar(codigo, 'concluido')
      expect(r.error).not.toBeNull()
      const { data } = await eq.from('agendamentos').select('status').eq('codigo', codigo).single()
      expect(data?.status).toBe('pendente')
    }, 30000)

    it('confirmado -> concluido e confirmado -> nao_compareceu são recusados (URB17) antes do início', async (ctx) => {
      // Regra no banco: concluir ou faltar só depois do começo do atendimento. Não dá para criar agendamento
      // no passado (criar_agendamento recusa), então o caminho "depois do início" não é testável aqui; ele é
      // coberto pelo trigger e pelo e2e simulado. Este teste fica pendente -> confirmado e termina cancelado.
      // UM agendamento no último horário livre de um dia útil (ter a sex) por volta de hoje+20, longe dos outros testes.
      let slot: string | undefined
      for (let i = 20; i >= 10 && !slot; i--) {
        const d = somaDias(hoje(), i)
        if (dow(d) >= 2 && dow(d) <= 5) slot = (await horarios('sobrancelha', d)).data.at(-1)
      }
      if (!slot) return ctx.skip('nenhum dia útil da janela com horário livre')
      const { linha, error: e0 } = await agendar({ servico: 'sobrancelha', inicio: slot })
      expect(e0).toBeNull()
      const codigo = linha!.codigo
      const a = await mudar(codigo, 'confirmado')
      expect(a.error).toBeNull()
      for (const destino of ['concluido', 'nao_compareceu']) {
        const b = await mudar(codigo, destino)
        expect(b.error?.code, destino).toBe('URB17')
        expect(b.error?.message).toMatch(/ainda não começou/)
      }
      const { data } = await eq.from('agendamentos').select('status').eq('codigo', codigo).single()
      expect(data?.status).toBe('confirmado')
      // Cancelar continua valendo a qualquer hora (e o afterAll também cancela).
      expect((await mudar(codigo, 'cancelado')).error).toBeNull()
    }, 30000)
  })
})
