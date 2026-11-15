import { describe, expect, it } from 'vitest'
import { montarBuscaPainel } from '../../src/lib/painel/busca'

describe('montarBuscaPainel', () => {
  it('Dia, filtro desligado: só ?dia=', () => {
    expect(montarBuscaPainel('dia', '2026-11-04', false).toString()).toBe('dia=2026-11-04')
  })

  it('Semana, filtro desligado: visao antes do dia', () => {
    expect(montarBuscaPainel('semana', '2026-11-04', false).toString()).toBe('visao=semana&dia=2026-11-04')
  })

  it('filtro ligado vai junto, por último, em qualquer visão', () => {
    expect(montarBuscaPainel('dia', '2026-11-04', true).toString()).toBe('dia=2026-11-04&cancelados=1')
    expect(montarBuscaPainel('semana', '2026-11-04', true).toString()).toBe('visao=semana&dia=2026-11-04&cancelados=1')
  })
})
