import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  agruparPorBarbeiro,
  calcularGrade,
  densidadeDoBloco,
  distribuirFaixas,
  duracaoEmMinutos,
  estaAtivo,
  etiquetaAgoraCobreHora,
  formatarFaixaHora,
  lerDia,
  minutoNoDia,
  posicaoNaGrade,
  rotuloDia,
  rotuloMinutos,
  rotuloStatus,
  type Agendamento,
  type Bloqueio,
  type StatusAgendamento,
} from '../../src/lib/painel/agenda'

// São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019): 09:00 em SP = 12:00Z.
// Sexta 09/10/2026: funcionamento 09:00 às 20:00. Sábado 10/10: 09:00 às 18:00. Segunda 12/10: fechado.
const SEXTA = '2026-10-09'
const SABADO = '2026-10-10'
const SEGUNDA = '2026-10-12'

/** Instante em SP, por padrão na sexta 09/10/2026. Ex.: sp('09:30'). */
const sp = (hhmm: string, dia = SEXTA) => `${dia}T${hhmm}:00-03:00`

let n = 0
function ag(inicio: string, fim: string, extra: Partial<Agendamento> = {}): Agendamento {
  n++
  return {
    id: `ag-${n}`,
    codigo: `COD${n}`,
    status: 'pendente',
    inicio: sp(inicio),
    fim: sp(fim),
    barbeiroId: 'b1',
    barbeiroNome: 'Rafael',
    servicoNome: 'Corte',
    servicoTipo: 'avulso',
    clienteNome: 'Fulano',
    clienteTelefone: '11999990000',
    ...extra,
  }
}

function bloq(inicio: string, fim: string, extra: Partial<Bloqueio> = {}): Bloqueio {
  n++
  return { id: `bl-${n}`, barbeiroId: 'b1', barbeiroNome: 'Rafael', inicio, fim, motivo: 'Folga', ...extra }
}

describe('lerDia', () => {
  const hoje = '2026-10-10'
  it('aceita um dia válido', () => {
    expect(lerDia('2026-10-15', hoje)).toBe('2026-10-15')
    expect(lerDia('2028-02-29', hoje)).toBe('2028-02-29')
  })
  it('ausente ou vazio cai em hoje', () => {
    expect(lerDia(null, hoje)).toBe(hoje)
    expect(lerDia('', hoje)).toBe(hoje)
  })
  it('formato errado ou data que não existe cai em hoje', () => {
    const ruins = ['10/10/2026', '2026-1-5', '2026-02-30', '2026-13-01', '2027-02-29', 'ontem', '2026-10-10T10:00', ' 2026-10-10']
    for (const ruim of ruins) expect(lerDia(ruim, hoje)).toBe(hoje)
  })
})

describe('rotuloDia', () => {
  it('dia da semana e dd/mm', () => {
    expect(rotuloDia(SEXTA)).toBe('sexta, 09/10')
    expect(rotuloDia(SABADO)).toBe('sábado, 10/10')
    expect(rotuloDia(SEGUNDA)).toBe('segunda, 12/10')
  })
})

describe('rotuloStatus e estaAtivo', () => {
  it('um texto em português para cada status', () => {
    const esperado: Record<StatusAgendamento, string> = {
      pendente: 'Pendente',
      confirmado: 'Confirmado',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      nao_compareceu: 'Não compareceu',
    }
    for (const [status, texto] of Object.entries(esperado)) {
      expect(rotuloStatus(status as StatusAgendamento)).toBe(texto)
    }
  })
  it('cancelado por expiração aparece como Expirado; só o cancelado muda', () => {
    expect(rotuloStatus('cancelado', true)).toBe('Expirado')
    expect(rotuloStatus('cancelado', false)).toBe('Cancelado')
    expect(rotuloStatus('confirmado', true)).toBe('Confirmado')
  })
  it('status desconhecido aparece como veio, sem quebrar', () => {
    expect(rotuloStatus('reagendado' as StatusAgendamento)).toBe('reagendado')
  })
  it('só cancelado deixa de ocupar a agenda', () => {
    expect(estaAtivo('cancelado')).toBe(false)
    expect(estaAtivo('pendente')).toBe(true)
    expect(estaAtivo('nao_compareceu')).toBe(true)
  })
})

// O resultado não pode depender do fuso do computador de quem abre o painel.
describe.each(['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo'])('hora com TZ=%s', (tz) => {
  const original = process.env.TZ
  beforeEach(() => {
    process.env.TZ = tz
  })
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  it('formatarFaixaHora sempre em São Paulo', () => {
    expect(formatarFaixaHora('2026-10-09T12:00:00Z', '2026-10-09T12:40:00Z')).toBe('09:00 – 09:40')
    expect(formatarFaixaHora('2026-10-10T02:30:00+00:00', '2026-10-10T03:00:00+00:00')).toBe('23:30 – 00:00')
  })

  it('minutoNoDia conta a partir da meia-noite de São Paulo', () => {
    expect(minutoNoDia('2026-10-09T12:00:00Z', SEXTA)).toBe(540)
    expect(minutoNoDia('2026-10-10T02:59:00Z', SEXTA)).toBe(23 * 60 + 59)
  })
})

describe('minutoNoDia: instante de outro dia', () => {
  it('antes do dia vale 0 e depois do dia vale 1440', () => {
    expect(minutoNoDia(sp('18:00', '2026-10-08'), SEXTA)).toBe(0)
    expect(minutoNoDia(sp('00:00', SABADO), SEXTA)).toBe(1440)
    expect(minutoNoDia(sp('10:00', SABADO), SEXTA)).toBe(1440)
  })
  it('meia-noite exata do próprio dia é 0', () => {
    expect(minutoNoDia(sp('00:00'), SEXTA)).toBe(0)
  })
})

describe('calcularGrade', () => {
  it('sexta: das 09:00 às 20:00, uma linha por hora', () => {
    const g = calcularGrade(SEXTA, [])
    expect(g.inicioMin).toBe(540)
    expect(g.fimMin).toBe(1200)
    expect(g.horas).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  })
  it('sábado fecha mais cedo', () => {
    const g = calcularGrade(SABADO, [])
    expect(g.fimMin).toBe(18 * 60)
    expect(g.horas).toHaveLength(9)
  })
  it('dia fechado usa a janela mais ampla da semana (a grade nunca fica sem horas)', () => {
    const g = calcularGrade(SEGUNDA, [])
    expect(g.inicioMin).toBe(540)
    expect(g.fimMin).toBe(1200)
  })
  it('agendamento antes da abertura amplia o começo, em hora cheia', () => {
    const g = calcularGrade(SEXTA, [ag('07:30', '08:00')])
    expect(g.inicioMin).toBe(7 * 60)
    expect(g.horas[0]).toBe(7)
  })
  it('agendamento depois do fechamento amplia o fim para a próxima hora cheia', () => {
    const g = calcularGrade(SEXTA, [ag('20:30', '21:15')])
    expect(g.fimMin).toBe(22 * 60)
    expect(g.horas.at(-1)).toBe(21)
  })
  it('agendamento dentro do expediente não muda a grade', () => {
    const g = calcularGrade(SEXTA, [ag('10:00', '10:40')])
    expect(g).toEqual(calcularGrade(SEXTA, []))
  })
  it('cancelado fora do expediente não amplia a grade', () => {
    const g = calcularGrade(SEXTA, [
      ag('07:00', '07:40', { status: 'cancelado' }),
      ag('21:00', '21:40', { status: 'cancelado' }),
    ])
    expect(g).toEqual(calcularGrade(SEXTA, []))
  })
  it('incluirCancelados: o cancelado fora do expediente também amplia a grade', () => {
    const cancelados = [ag('07:00', '07:40', { status: 'cancelado' }), ag('21:00', '21:40', { status: 'cancelado' })]
    const g = calcularGrade(SEXTA, cancelados, undefined, true)
    expect(g.inicioMin).toBe(7 * 60)
    expect(g.fimMin).toBe(22 * 60)
    // Desligado (padrão), a grade é a de sempre.
    expect(calcularGrade(SEXTA, cancelados, undefined, false)).toEqual(calcularGrade(SEXTA, []))
  })
  it('incluirCancelados sem cancelado fora do expediente não muda a grade', () => {
    expect(calcularGrade(SEXTA, [ag('10:00', '10:40', { status: 'cancelado' })], undefined, true)).toEqual(
      calcularGrade(SEXTA, []),
    )
  })
  it('não-compareceu e concluído fora do expediente ampliam (ainda ocupam a agenda)', () => {
    expect(calcularGrade(SEXTA, [ag('07:00', '07:40', { status: 'nao_compareceu' })]).inicioMin).toBe(420)
    expect(calcularGrade(SEXTA, [ag('21:00', '21:40', { status: 'concluido' })]).fimMin).toBe(22 * 60)
  })
  it('sem nenhuma faixa aberta no funcionamento, usa 09:00 às 20:00', () => {
    const fechado = [{ dias: [0, 1, 2, 3, 4, 5, 6], rotulo: 'Todos', abre: null, fecha: null }]
    for (const funcionamento of [fechado, []]) {
      const g = calcularGrade(SEXTA, [], funcionamento)
      expect(g.inicioMin).toBe(540)
      expect(g.fimMin).toBe(1200)
      expect(g.horas).toHaveLength(11)
    }
  })
  it('o fim nunca passa de 24h', () => {
    const g = calcularGrade(SEXTA, [ag('23:00', '23:59')])
    expect(g.fimMin).toBe(1440)
  })
})

describe('posicaoNaGrade', () => {
  const grade = calcularGrade(SEXTA, []) // 540..1200 = 660 min

  it('começo da grade fica no topo', () => {
    const p = posicaoNaGrade(grade, SEXTA, sp('09:00'), sp('09:40'))
    expect(p?.topoPct).toBe(0)
    expect(p?.alturaPct).toBeCloseTo((40 / 660) * 100, 6)
  })
  it('posição proporcional ao horário', () => {
    const p = posicaoNaGrade(grade, SEXTA, sp('12:00'), sp('13:00'))
    expect(p?.topoPct).toBeCloseTo((180 / 660) * 100, 6)
    expect(p?.alturaPct).toBeCloseTo((60 / 660) * 100, 6)
  })
  it('recorta o que passa das bordas da grade', () => {
    const p = posicaoNaGrade(grade, SEXTA, sp('07:00'), sp('10:00'))
    expect(p?.topoPct).toBe(0)
    expect(p?.alturaPct).toBeCloseTo((60 / 660) * 100, 6)
  })
  it('bloqueio de vários dias ocupa a coluna inteira', () => {
    const p = posicaoNaGrade(grade, SEXTA, sp('10:00', '2026-10-07'), sp('10:00', '2026-10-12'))
    expect(p?.topoPct).toBe(0)
    expect(p?.alturaPct).toBeCloseTo(100, 6)
  })
  it('fora da grade ou sem duração devolve null', () => {
    expect(posicaoNaGrade(grade, SEXTA, sp('06:00'), sp('08:00'))).toBeNull()
    expect(posicaoNaGrade(grade, SEXTA, sp('21:00'), sp('22:00'))).toBeNull()
    expect(posicaoNaGrade(grade, SEXTA, sp('10:00'), sp('10:00'))).toBeNull()
  })
})

describe('duracaoEmMinutos e densidadeDoBloco', () => {
  it('diferença em minutos', () => {
    expect(duracaoEmMinutos(sp('09:00'), sp('09:40'))).toBe(40)
    expect(duracaoEmMinutos(sp('09:00'), sp('10:45'))).toBe(105)
  })
  it('quanto mais longo, mais texto cabe', () => {
    expect(densidadeDoBloco(15)).toBe('linha')
    expect(densidadeDoBloco(29)).toBe('linha')
    expect(densidadeDoBloco(30)).toBe('dupla')
    expect(densidadeDoBloco(44)).toBe('dupla')
    expect(densidadeDoBloco(45)).toBe('completa')
    expect(densidadeDoBloco(105)).toBe('completa')
  })
})

describe('distribuirFaixas', () => {
  it('sem sobreposição, cada um ocupa a coluna inteira', () => {
    const a = ag('09:00', '09:40')
    const b = ag('09:40', '10:10') // encostar não é sobrepor
    const f = distribuirFaixas([a, b])
    expect(f.get(a.id)).toEqual({ indice: 0, total: 1 })
    expect(f.get(b.id)).toEqual({ indice: 0, total: 1 })
  })
  it('dois que se sobrepõem dividem a coluna ao meio', () => {
    const cancelado = ag('09:00', '10:00', { status: 'cancelado' })
    const novo = ag('09:30', '10:30')
    const f = distribuirFaixas([novo, cancelado])
    expect(f.get(cancelado.id)).toEqual({ indice: 0, total: 2 })
    expect(f.get(novo.id)).toEqual({ indice: 1, total: 2 })
  })
  it('reaproveita a faixa que já terminou e depois recomeça com uma só', () => {
    const a = ag('09:00', '10:00')
    const b = ag('09:30', '10:30')
    const c = ag('10:00', '11:00')
    const d = ag('12:00', '13:00')
    const f = distribuirFaixas([a, b, c, d])
    expect(f.get(a.id)).toEqual({ indice: 0, total: 2 })
    expect(f.get(b.id)).toEqual({ indice: 1, total: 2 })
    expect(f.get(c.id)).toEqual({ indice: 0, total: 2 })
    expect(f.get(d.id)).toEqual({ indice: 0, total: 1 })
  })
  it('três no mesmo horário ocupam três faixas', () => {
    const tres = [ag('09:00', '10:00'), ag('09:00', '10:00'), ag('09:00', '10:00')]
    const f = distribuirFaixas(tres)
    expect(tres.map((t) => f.get(t.id)?.indice).sort()).toEqual([0, 1, 2])
    expect(tres.every((t) => f.get(t.id)?.total === 3)).toBe(true)
  })
  it('lista vazia', () => {
    expect(distribuirFaixas([]).size).toBe(0)
  })
})

describe('agruparPorBarbeiro', () => {
  const barbeiros = [
    { id: 'b1', nome: 'Rafael' },
    { id: 'b2', nome: 'Diego' },
    { id: 'b3', nome: 'Caio' },
  ]

  it('barbeiro sem agendamento também ganha coluna, na ordem recebida', () => {
    const colunas = agruparPorBarbeiro(barbeiros, [ag('09:00', '09:40', { barbeiroId: 'b2', barbeiroNome: 'Diego' })], [])
    expect(colunas.map((c) => c.nome)).toEqual(['Rafael', 'Diego', 'Caio'])
    expect(colunas.map((c) => c.agendamentos.length)).toEqual([0, 1, 0])
  })
  it('sem nenhum dado ainda há uma coluna por barbeiro', () => {
    expect(agruparPorBarbeiro(barbeiros, [], [])).toHaveLength(3)
  })
  it('sem barbeiros e sem agendamentos não há colunas', () => {
    expect(agruparPorBarbeiro([], [], [])).toEqual([])
  })
  it('agendamento de barbeiro fora da lista (desativado) ganha coluna no fim', () => {
    const antigo = ag('10:00', '10:40', { barbeiroId: 'b9', barbeiroNome: 'Marcos' })
    const colunas = agruparPorBarbeiro(barbeiros, [antigo], [])
    expect(colunas.map((c) => c.nome)).toEqual(['Rafael', 'Diego', 'Caio', 'Marcos'])
    expect(colunas[3].agendamentos).toEqual([antigo])
  })
  it('ordena os agendamentos de cada coluna por horário', () => {
    const tarde = ag('15:00', '15:40')
    const manha = ag('09:00', '09:40')
    const colunas = agruparPorBarbeiro(barbeiros, [tarde, manha], [])
    expect(colunas[0].agendamentos).toEqual([manha, tarde])
  })
  it('bloqueio sem barbeiro vale para todas as colunas; o de um barbeiro só para ele', () => {
    const geral = bloq(sp('12:00'), sp('13:00'), { barbeiroId: null, barbeiroNome: null, motivo: 'Feriado' })
    const doDiego = bloq(sp('15:00'), sp('16:00'), { barbeiroId: 'b2', barbeiroNome: 'Diego' })
    const colunas = agruparPorBarbeiro(barbeiros, [], [doDiego, geral])
    expect(colunas.map((c) => c.bloqueios.length)).toEqual([1, 2, 1])
    expect(colunas[1].bloqueios).toEqual([geral, doDiego])
  })
  it('bloqueio de barbeiro fora da lista de ativos ganha coluna no fim, com o nome do bloqueio', () => {
    const antigo = bloq(sp('12:00'), sp('13:00'), { barbeiroId: 'b9', barbeiroNome: 'Marcos' })
    const colunas = agruparPorBarbeiro(barbeiros, [], [antigo])
    expect(colunas.map((c) => c.nome)).toEqual(['Rafael', 'Diego', 'Caio', 'Marcos'])
    expect(colunas[3]).toMatchObject({ barbeiroId: 'b9', agendamentos: [], bloqueios: [antigo] })
    expect(colunas.slice(0, 3).every((c) => c.bloqueios.length === 0)).toBe(true)
  })
  it('agendamento e bloqueio do mesmo barbeiro ausente dividem uma coluna só', () => {
    const a = ag('10:00', '10:40', { barbeiroId: 'b9', barbeiroNome: 'Marcos' })
    const k = bloq(sp('14:00'), sp('15:00'), { barbeiroId: 'b9', barbeiroNome: 'Marcos' })
    const colunas = agruparPorBarbeiro(barbeiros, [a], [k])
    expect(colunas).toHaveLength(4)
    expect(colunas[3]).toMatchObject({ nome: 'Marcos', agendamentos: [a], bloqueios: [k] })
  })
  it('bloqueio da barbearia inteira vale também para a coluna criada por barbeiro ausente, qualquer que seja a ordem', () => {
    const geral = bloq(sp('12:00'), sp('13:00'), { barbeiroId: null, barbeiroNome: null, motivo: 'Feriado' })
    const antigo = bloq(sp('15:00'), sp('16:00'), { barbeiroId: 'b9', barbeiroNome: 'Marcos' })
    for (const ordem of [[geral, antigo], [antigo, geral]]) {
      const colunas = agruparPorBarbeiro(barbeiros, [], ordem)
      expect(colunas).toHaveLength(4)
      expect(colunas.every((c) => c.bloqueios.includes(geral))).toBe(true)
      expect(colunas[3].bloqueios).toEqual([geral, antigo])
    }
  })
  it('bloqueio de barbeiro ausente sem nome ainda aparece, com nome genérico', () => {
    const k = bloq(sp('12:00'), sp('13:00'), { barbeiroId: 'b9', barbeiroNome: null })
    expect(agruparPorBarbeiro(barbeiros, [], [k])[3].nome).toBe('Barbeiro')
  })
  it('cancelado continua na coluna (a tela o esmaece)', () => {
    const c = ag('09:00', '09:40', { status: 'cancelado' })
    expect(agruparPorBarbeiro(barbeiros, [c], [])[0].agendamentos).toEqual([c])
  })
})

describe('rotuloMinutos', () => {
  it('formata minutos desde a meia-noite como HH:MM', () => {
    expect(rotuloMinutos(0)).toBe('00:00')
    expect(rotuloMinutos(9 * 60 + 5)).toBe('09:05')
    expect(rotuloMinutos(15 * 60 + 20)).toBe('15:20')
  })
})

describe('etiquetaAgoraCobreHora', () => {
  it('cobre a hora cheia quando o agora está colado nela (um pouco antes ou depois)', () => {
    expect(etiquetaAgoraCobreHora(15 * 60, 15)).toBe(true)
    expect(etiquetaAgoraCobreHora(15 * 60 + 10, 15)).toBe(true)
    expect(etiquetaAgoraCobreHora(14 * 60 + 55, 15)).toBe(true)
  })
  it('não cobre quando está longe', () => {
    expect(etiquetaAgoraCobreHora(15 * 60 + 20, 15)).toBe(false)
    expect(etiquetaAgoraCobreHora(15 * 60 + 20, 16)).toBe(false)
    expect(etiquetaAgoraCobreHora(14 * 60 + 40, 15)).toBe(false)
  })
})
