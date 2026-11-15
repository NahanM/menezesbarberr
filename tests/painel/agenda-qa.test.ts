import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { somarDias } from '../../src/lib/agendar/datas'
import {
  agruparPorBarbeiro,
  calcularGrade,
  distribuirFaixas,
  lerDia,
  minutoNoDia,
  posicaoNaGrade,
  rotuloDia,
  somarDiasValidos,
  type Agendamento,
} from '../../src/lib/painel/agenda'

// QA do 4.2: bordas que o teste do dev não cobre.
const HOJE = '2026-10-10'
let n = 0
const ag = (inicio: string, fim: string, extra: Partial<Agendamento> = {}): Agendamento => ({
  id: `qa-${++n}`, codigo: 'X', status: 'confirmado', inicio, fim, barbeiroId: 'b1', barbeiroNome: 'Rafael',
  servicoNome: 'Corte', servicoTipo: 'avulso', clienteNome: 'Fulano', clienteTelefone: '11999990000', ...extra,
})

describe('lerDia: limites', () => {
  it.each(['2026-02-30', '2026-02-29', '2026-04-31', '2026-00-10', '2026-10-00', '2026-10-32', '', ' ', '2026-10-10\n', '２026-10-10', '+2026-10-10', '2026-10-10 '])(
    '%j cai em hoje', (v) => expect(lerDia(v, HOJE)).toBe(HOJE))
  it('ano bissexto: 2028-02-29 vale, 2100-02-29 não (século não bissexto), 2000-02-29 vale', () => {
    expect(lerDia('2028-02-29', HOJE)).toBe('2028-02-29')
    expect(lerDia('2100-02-29', HOJE)).toBe(HOJE)
    expect(lerDia('2000-02-29', HOJE)).toBe('2000-02-29')
  })
  it('anos de 0000 a 0099 (Date.UTC mapeia para 19xx) caem em hoje', () => {
    for (const v of ['0000-01-01', '0050-06-15', '0099-12-31']) expect(lerDia(v, HOJE)).toBe(HOJE)
  })
  it('datas muito distantes mas existentes são aceitas e têm rótulo', () => {
    expect(lerDia('9999-12-31', HOJE)).toBe('9999-12-31')
    expect(lerDia('1900-01-01', HOJE)).toBe('1900-01-01')
    expect(rotuloDia('9999-12-31')).toMatch(/31\/12/)
  })
  // Corrigido no 4.3: nas pontas do calendário os botões ficam desabilitados (somarDiasValidos devolve null)
  // em vez de gerar um dia que o lerDia descartaria.
  it('"Próximo dia" em 9999-12-31 não existe (null), e o dia anterior a ele existe', () => {
    expect(somarDiasValidos('9999-12-31', 1)).toBeNull()
    expect(somarDiasValidos('9999-12-31', -1)).toBe('9999-12-30')
  })
  it('"Dia anterior" em 0100-01-01 não existe (null), e o seguinte existe', () => {
    expect(somarDiasValidos('0100-01-01', -1)).toBeNull()
    expect(somarDiasValidos('0100-01-01', 1)).toBe('0100-01-02')
  })
  it('tudo que somarDiasValidos devolve o lerDia aceita (e o que ele recusa o lerDia também recusaria)', () => {
    for (const [dia, n] of [['9999-12-30', 1], ['9999-12-25', 7], ['9999-12-26', 7], ['0100-01-08', -7], ['0100-01-07', -7], ['2026-12-31', 1]] as const) {
      const r = somarDiasValidos(dia, n)
      if (r !== null) expect(lerDia(r, HOJE)).toBe(r)
      else expect(lerDia(somarDias(dia, n), HOJE)).toBe(HOJE)
    }
  })
})

describe('madrugada: 23:30 atravessando a meia-noite (SP)', () => {
  const D = '2026-10-09'
  const D2 = '2026-10-10'
  const a = ag('2026-10-09T23:30:00-03:00', '2026-10-10T00:10:00-03:00')
  it('no dia do início: vai até 24h e o bloco cola no fim da grade', () => {
    expect(minutoNoDia(a.fim, D)).toBe(1440)
    const g = calcularGrade(D, [a])
    expect(g.fimMin).toBe(1440)
    const p = posicaoNaGrade(g, D, a.inicio, a.fim)!
    expect(p.topoPct + p.alturaPct).toBeCloseTo(100, 5)
  })
  it('no dia seguinte: o trecho de 00:00 a 00:10 aparece, a grade começa em 0h', () => {
    const g = calcularGrade(D2, [a])
    expect(g.inicioMin).toBe(0)
    const p = posicaoNaGrade(g, D2, a.inicio, a.fim)!
    expect(p.topoPct).toBe(0)
    expect(p.alturaPct).toBeGreaterThan(0)
  })
  it('02:30Z ainda é 23:30 do dia anterior em SP', () => {
    expect(minutoNoDia('2026-10-10T02:30:00Z', D)).toBe(23 * 60 + 30)
  })
})

describe('fora da grade e casos degenerados', () => {
  it('agendamentos às 06:15 e 22:50 ampliam em hora cheia (6h a 23h)', () => {
    const g = calcularGrade('2026-10-09', [
      ag('2026-10-09T06:15:00-03:00', '2026-10-09T06:45:00-03:00'),
      ag('2026-10-09T22:20:00-03:00', '2026-10-09T22:50:00-03:00'),
    ])
    expect([g.inicioMin, g.fimMin]).toEqual([360, 1380])
    expect(g.horas.length).toBe(17)
  })
  it('duração zero some da grade (posicao null)', () => {
    const z = ag('2026-10-09T10:00:00-03:00', '2026-10-09T10:00:00-03:00')
    const g = calcularGrade('2026-10-09', [z])
    expect(posicaoNaGrade(g, '2026-10-09', z.inicio, z.fim)).toBeNull()
  })
})

describe('muitos sobrepostos', () => {
  it('30 no mesmo horário: 30 faixas distintas', () => {
    const itens = Array.from({ length: 30 }, () => ag('2026-10-09T10:00:00-03:00', '2026-10-09T11:00:00-03:00'))
    const f = distribuirFaixas(itens)
    expect(new Set([...f.values()].map((x) => x.indice)).size).toBe(30)
    expect([...f.values()].every((x) => x.total === 30)).toBe(true)
  })
  it('encadeado A(10-11) B(10:30-11:30) C(11-12): C reaproveita a faixa de A', () => {
    const A = ag('2026-10-09T10:00:00-03:00', '2026-10-09T11:00:00-03:00')
    const B = ag('2026-10-09T10:30:00-03:00', '2026-10-09T11:30:00-03:00')
    const C = ag('2026-10-09T11:00:00-03:00', '2026-10-09T12:00:00-03:00')
    const f = distribuirFaixas([C, B, A])
    expect(f.get(C.id)).toEqual({ indice: 0, total: 2 })
    expect(f.get(B.id)).toEqual({ indice: 1, total: 2 })
  })
  it('agrupar 500 agendamentos é rápido (< 200 ms)', () => {
    const h = (x: number) => String(x).padStart(2, '0')
    const itens = Array.from({ length: 500 }, (_, i) => ag(`2026-10-09T${h(9 + (i % 10))}:00:00-03:00`, `2026-10-09T${h(10 + (i % 10))}:00:00-03:00`))
    const t = performance.now()
    distribuirFaixas(itens)
    agruparPorBarbeiro([{ id: 'b1', nome: 'R' }], itens, [])
    expect(performance.now() - t).toBeLessThan(200)
  })
})

describe('contraste AA dos textos de status (tokens do tema)', () => {
  const css = readFileSync('src/styles/index.css', 'utf8')
  const cor = (nome: string) => css.match(new RegExp(`--color-${nome}:\\s*(#[0-9a-fA-F]{6})`))![1]
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const razao = (a: string, b: string) => { const [x, y] = [lum(cor(a)), lum(cor(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const pares: [string, string][] = [
    ['neon', 'concreto'], ['branco', 'concreto'], ['cinza-claro', 'concreto'], ['chumbo', 'concreto'],
    ['cinza-claro', 'asfalto'], ['chumbo', 'asfalto'], ['branco', 'preto'], ['cinza-claro', 'preto'],
    ['chumbo', 'preto'], ['neon', 'preto'],
  ]
  it.each(pares)('%s sobre %s >= 4.5:1', (t, f) => expect(razao(t, f)).toBeGreaterThanOrEqual(4.5))
})
