import { describe, it, expect } from 'vitest'
import { acoesDisponiveis, type IdAcao } from '../../src/lib/painel/acoes'
import type { StatusAgendamento } from '../../src/lib/painel/agenda'

const INICIO = '2026-11-04T13:00:00Z' // 10:00 em São Paulo
const t = (iso: string) => Date.parse(iso)
const ids = (status: StatusAgendamento, agora: number | Date) =>
  acoesDisponiveis(status, INICIO, agora).map((a) => a.id)

const ANTES = t('2026-11-04T12:59:59Z')
const NO_INICIO = t(INICIO)
const DEPOIS = t('2026-11-04T15:00:00Z')

describe('acoesDisponiveis', () => {
  it('pendente: confirmar e cancelar, antes e depois da hora', () => {
    expect(ids('pendente', ANTES)).toEqual(['confirmar', 'cancelar'])
    expect(ids('pendente', DEPOIS)).toEqual(['confirmar', 'cancelar'])
  })

  it('confirmado antes do início: só cancelar', () => {
    expect(ids('confirmado', ANTES)).toEqual(['cancelar'])
  })

  it('confirmado a partir do início (inclusive): concluir, não compareceu e cancelar', () => {
    expect(ids('confirmado', NO_INICIO)).toEqual(['concluir', 'nao_compareceu', 'cancelar'])
    expect(ids('confirmado', DEPOIS)).toEqual(['concluir', 'nao_compareceu', 'cancelar'])
  })

  it('aceita Date no lugar de milissegundos', () => {
    expect(ids('confirmado', new Date(DEPOIS))).toEqual(['concluir', 'nao_compareceu', 'cancelar'])
    expect(ids('confirmado', new Date(ANTES))).toEqual(['cancelar'])
  })

  it.each<StatusAgendamento>(['concluido', 'cancelado', 'nao_compareceu'])('%s: nenhuma ação', (status) => {
    expect(ids(status, DEPOIS)).toEqual([])
  })

  it('início ilegível conta como "não começou": esconde concluir e faltou', () => {
    expect(acoesDisponiveis('confirmado', 'lixo', DEPOIS).map((a) => a.id)).toEqual(['cancelar'])
  })

  it('cada ação leva ao status certo (nomes do enum do banco)', () => {
    const destino = Object.fromEntries(
      acoesDisponiveis('confirmado', INICIO, DEPOIS).map((a) => [a.id, a.destino]),
    ) as Record<IdAcao, string>
    expect(destino).toEqual({ concluir: 'concluido', nao_compareceu: 'nao_compareceu', cancelar: 'cancelado' })
    expect(acoesDisponiveis('pendente', INICIO, DEPOIS)[0].destino).toBe('confirmado')
  })

  it('só a ação principal é neon; cancelar e faltou são destrutivas e pedem 2ª etapa', () => {
    for (const status of ['pendente', 'confirmado'] as const) {
      const acoes = acoesDisponiveis(status, INICIO, DEPOIS)
      expect(acoes.filter((a) => a.principal).length).toBeLessThanOrEqual(1)
      for (const a of acoes) {
        expect(a.destrutiva).toBe(a.id === 'cancelar' || a.id === 'nao_compareceu')
        expect(a.confirmacao !== null).toBe(a.destrutiva)
        expect(a.pergunta !== null).toBe(a.destrutiva)
        expect(a.principal && a.destrutiva).toBe(false)
        expect(a.sucesso).not.toBe('')
      }
    }
    expect(acoesDisponiveis('pendente', INICIO, DEPOIS)[0].principal).toBe(true)
    expect(acoesDisponiveis('confirmado', INICIO, ANTES).some((a) => a.principal)).toBe(false)
  })
})

describe('nome acessível', () => {
  it('só o cancelar tem nome próprio ("Cancelar" sozinho é ambíguo com Fechar); começa pelo texto visível', () => {
    for (const status of ['pendente', 'confirmado'] as const) {
      for (const a of acoesDisponiveis(status, INICIO, DEPOIS)) {
        if (a.id === 'cancelar') {
          expect(a.nomeAcessivel).toBe('Cancelar agendamento')
          expect(a.nomeAcessivel?.startsWith(a.rotulo)).toBe(true) // WCAG 2.5.3: o nome contém o texto visível
        } else expect(a.nomeAcessivel).toBeNull()
      }
    }
  })
})
