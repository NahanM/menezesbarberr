// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  hojeEmSP, formatarDiaSemana, formatarDDMM, formatarHHMM, diasSelecionaveis, somarDias, diaDaSemana,
} from '../../src/lib/agendar/datas'

const TZ_ORIGINAL = process.env.TZ

// O código usa timeZone explícito, então o resultado não pode depender do fuso do processo.
describe.each(['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo'])('datas com TZ=%s', (tz) => {
  beforeEach(() => {
    process.env.TZ = tz
  })
  afterEach(() => {
    vi.useRealTimers()
    if (TZ_ORIGINAL === undefined) delete process.env.TZ
    else process.env.TZ = TZ_ORIGINAL
  })

  it('hojeEmSP perto da meia-noite', () => {
    expect(hojeEmSP(new Date('2026-10-10T02:30:00Z'))).toBe('2026-10-09')
    expect(hojeEmSP(new Date('2026-10-10T02:59:59Z'))).toBe('2026-10-09')
    expect(hojeEmSP(new Date('2026-10-10T03:00:00Z'))).toBe('2026-10-10')
    expect(hojeEmSP(new Date('2026-12-31T23:59:00-03:00'))).toBe('2026-12-31')
    expect(hojeEmSP(new Date('2027-01-01T02:59:00Z'))).toBe('2026-12-31')
  })

  it('hojeEmSP usa o relógio fake por padrão', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:30:00Z'))
    expect(hojeEmSP()).toBe('2026-10-09')
  })

  it('formatar a partir de timestamptz', () => {
    const t = '2026-10-10T02:30:00+00:00' // 23:30 de sexta 09/10 em SP
    expect(formatarDiaSemana(t)).toBe('sexta')
    expect(formatarDDMM(t)).toBe('09/10')
    expect(formatarHHMM(t)).toBe('23:30')
    const m = '2026-10-10T03:00:00Z' // meia-noite em SP: sábado 10/10 00:00 (não 24:00)
    expect(formatarDiaSemana(m)).toBe('sábado')
    expect(formatarDDMM(m)).toBe('10/10')
    expect(formatarHHMM(m)).toBe('00:00')
    expect(formatarHHMM('2026-10-09T14:30:00-03:00')).toBe('14:30')
    // 00:00 em Tóquio de 10/10 = 15:00Z de 09/10 = 12:00 em SP, ainda dia 09 (sexta)
    expect(formatarDiaSemana('2026-10-10T00:00:00+09:00')).toBe('sexta')
  })

  it('formatar aceita dia AAAA-MM-DD sem escorregar de dia', () => {
    expect(formatarDDMM('2026-10-09')).toBe('09/10')
    expect(formatarDiaSemana('2026-10-09')).toBe('sexta')
    expect(formatarDiaSemana('2026-10-11')).toBe('domingo')
  })

  it('diasSelecionaveis: janela de 30 dias, domingo/segunda fechados', () => {
    const dias = diasSelecionaveis(new Date('2026-10-10T02:30:00Z'))
    expect(dias).toHaveLength(31)
    expect(dias[0].iso).toBe('2026-10-09')
    expect(dias[30].iso).toBe('2026-11-08')
    for (const d of dias) {
      expect(d.fechado).toBe(d.diaSemana === 0 || d.diaSemana === 1)
      expect(d.diaSemana).toBe(diaDaSemana(d.iso))
    }
    expect(dias.find((d) => d.iso === '2026-10-11')?.fechado).toBe(true) // domingo
    expect(dias.find((d) => d.iso === '2026-10-12')?.fechado).toBe(true) // segunda
    expect(dias.find((d) => d.iso === '2026-10-13')?.fechado).toBe(false) // terça
    expect(dias.find((d) => d.iso === '2026-10-17')?.fechado).toBe(false) // sábado
  })

  it('diasSelecionaveis respeita janela customizada', () => {
    const dias = diasSelecionaveis(new Date('2026-10-10T02:30:00Z'), 3)
    expect(dias.map((d) => d.iso)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'])
  })

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })
})
