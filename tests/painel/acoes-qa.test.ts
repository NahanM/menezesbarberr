import { describe, it, expect } from 'vitest'
import { acoesDisponiveis } from '../../src/lib/painel/acoes'
import { agendaDesatualizada, mensagemErroStatus, normalizarErroStatus } from '../../src/lib/painel/erroStatus'
import { linkParaCliente, mensagemParaCliente } from '../../src/lib/agendar/mensagem'
import { mascararTelefone } from '../../src/lib/agendar/dados'

// QA do incremento 4.4: bordas que os testes do dev não cobrem.
const INICIO = '2026-10-14T17:30:00+00:00'
const T = Date.parse(INICIO)
const ids = (s: Parameters<typeof acoesDisponiveis>[0], agora: number) => acoesDisponiveis(s, INICIO, agora).map((a) => a.id)

describe('acoesDisponiveis: o instante do início', () => {
  it('1 ms antes: só cancelar', () => expect(ids('confirmado', T - 1)).toEqual(['cancelar']))
  it('1 s antes: só cancelar', () => expect(ids('confirmado', T - 1000)).toEqual(['cancelar']))
  it('exatamente no início: concluir, faltou, cancelar', () =>
    expect(ids('confirmado', T)).toEqual(['concluir', 'nao_compareceu', 'cancelar']))
  it('1 s depois: as três', () => expect(ids('confirmado', T + 1000)).toEqual(['concluir', 'nao_compareceu', 'cancelar']))
  it('mesmo instante em outro formato de fuso (-03:00 e Z)', () => {
    expect(acoesDisponiveis('confirmado', '2026-10-14T14:30:00-03:00', T - 1)).toHaveLength(1)
    expect(acoesDisponiveis('confirmado', '2026-10-14T17:30:00Z', T)).toHaveLength(3)
  })
  it('formato do Postgres com espaço e +00', () => {
    expect(acoesDisponiveis('confirmado', '2026-10-14 17:30:00+00', T)).toHaveLength(3)
  })
  it('Date igual a number', () => {
    expect(acoesDisponiveis('confirmado', INICIO, new Date(T - 1))).toHaveLength(1)
    expect(acoesDisponiveis('confirmado', INICIO, new Date(T))).toHaveLength(3)
  })
  it('agora NaN esconde concluir e faltou', () => expect(ids('confirmado', NaN)).toEqual(['cancelar']))
  it('estados finais nunca oferecem nada, mesmo muito depois', () => {
    for (const s of ['concluido', 'cancelado', 'nao_compareceu'] as const) expect(ids(s, T + 9e9)).toEqual([])
  })
  it('status desconhecido (enum novo no banco) não oferece nada', () => {
    expect(acoesDisponiveis('xpto' as never, INICIO, T + 1)).toEqual([])
  })
  it('pendente depois do início: não oferece concluir (transição inválida no banco)', () => {
    expect(ids('pendente', T + 1000)).toEqual(['confirmar', 'cancelar'])
  })
})

describe('linkParaCliente: telefone e nome', () => {
  const d = { nome: 'Ana', inicio: INICIO }
  const num = (tel: string) => new URL(linkParaCliente(tel, d)).pathname.slice(1)
  it('10 dígitos sem 55', () => expect(num('1133334444')).toBe('551133334444'))
  it('11 dígitos sem 55', () => expect(num('11999990000')).toBe('5511999990000'))
  it('12 dígitos com 55 (fixo)', () => expect(num('551133334444')).toBe('551133334444'))
  it('13 dígitos com 55 (celular)', () => expect(num('5511999990000')).toBe('5511999990000'))
  it('DDD 55 (RS) com 11 dígitos sem DDI ganha 55 e não é confundido com DDI', () => {
    expect(num('55999990000')).toBe('5555999990000')
  })
  it.each([
    ['emoji', 'Zé 😀 Silva'],
    ['acento', 'José Çãõ'],
    ['e comercial', 'A&B Barbearia'],
    ['hash, interrogação, igual e mais', 'a#b?c=d+e'],
    ['aspas e porcentagem', 'Pedro "100%" %41'],
    ['quebra de linha', 'Ana\nMaria'],
  ])('nome com %s: texto volta íntegro e só há 1 parâmetro', (_n, nome) => {
    const link = linkParaCliente('5511999990000', { nome, inicio: INICIO })
    const url = new URL(link)
    expect(url.origin).toBe('https://wa.me')
    expect([...url.searchParams.keys()]).toEqual(['text'])
    expect(url.hash).toBe('')
    expect(url.searchParams.get('text')).toBe(mensagemParaCliente({ nome, inicio: INICIO }))
    expect(link.split('?text=')[1]).not.toMatch(/[ &#"\n+]/)
  })
  it('nome com emoji no começo: primeiro nome é o emoji, sem quebrar', () => {
    expect(mensagemParaCliente({ nome: '😀 Ana', inicio: INICIO })).toMatch(/^Olá, 😀!/)
  })
  it('nome com espaços nas pontas e duplos', () => {
    expect(mensagemParaCliente({ nome: '  Ana   Maria ', inicio: INICIO })).toMatch(/^Olá, Ana!/)
  })
  it('meia-noite: 02:59:59Z ainda é 23:59 do dia anterior em SP; 03:00:00Z é 00:00 do dia seguinte', () => {
    expect(mensagemParaCliente({ nome: 'Ana', inicio: '2026-10-15T02:59:59Z' })).toContain('quarta 14/10 às 23:59')
    expect(mensagemParaCliente({ nome: 'Ana', inicio: '2026-10-15T03:00:00Z' })).toContain('quinta 15/10 às 00:00')
  })
})

describe('mascararTelefone com os formatos do banco', () => {
  it.each([
    ['1133334444', '(11) 3333-4444'],
    ['11999990000', '(11) 99999-0000'],
    ['551133334444', '(11) 3333-4444'],
    ['5511999990000', '(11) 99999-0000'],
    ['55999990000', '(55) 99999-0000'],
    ['5555999990000', '(55) 99999-0000'],
  ])('%s -> %s', (entrada, saida) => expect(mascararTelefone(entrada)).toBe(saida))
})

describe('erroStatus: bordas', () => {
  it.each([[null], [undefined], ['texto'], [42], [{}], [{ code: 42 }], [{ message: null }]])(
    'entrada estranha %j: DESCONHECIDO sem lançar',
    (e) => {
      expect(normalizarErroStatus(e)).toBe('DESCONHECIDO')
    },
  )
  it('TypeError do fetch (Failed to fetch / Load failed / NetworkError)', () => {
    for (const m of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(normalizarErroStatus(new TypeError(m)), m).toBe('REDE')
    }
  })
  it('42501 vence mesmo com mensagem contendo "jwt"', () => {
    expect(normalizarErroStatus({ code: '42501', message: 'permission denied (jwt role)' })).toBe('SEM_PERMISSAO')
  })
  it('JWT expirado do PostgREST', () => {
    expect(normalizarErroStatus({ code: 'PGRST303', message: 'JWT expired' })).toBe('SESSAO')
    expect(normalizarErroStatus({ message: 'JWT expired' })).toBe('SESSAO')
  })
  it('URB17 com a mensagem real do trigger', () => {
    expect(
      normalizarErroStatus({
        code: 'URB17',
        message: 'O atendimento ainda não começou. Só dá para concluir ou marcar falta depois do horário.',
      }),
    ).toBe('AINDA_NAO_COMECOU')
  })
  it('transição inválida só pelo texto, caixa diferente', () => {
    expect(normalizarErroStatus({ message: 'TRANSIÇÃO DE STATUS INVÁLIDA: cancelado -> confirmado' })).toBe('TRANSICAO')
  })
  it('só TRANSICAO e NAO_ENCONTRADO rebuscam; URB17 não', () => {
    expect(agendaDesatualizada('AINDA_NAO_COMECOU')).toBe(false)
    expect(agendaDesatualizada('SEM_PERMISSAO')).toBe(false)
    expect(agendaDesatualizada('REDE')).toBe(false)
    expect(mensagemErroStatus('SESSAO')).toMatch(/sessão/i)
  })
})
