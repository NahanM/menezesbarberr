import { describe, expect, it } from 'vitest'
import {
  colunasComFiltro,
  contarCancelados,
  filtrarCancelados,
  lerCancelados,
  avisoCancelados,
  mostrarBotaoCancelados,
  rotuloBotaoCancelados,
  textoColunaVazia,
} from '../../src/lib/painel/cancelados'
import { contarAtendimentos, type Agendamento, type ColunaBarbeiro, type StatusAgendamento } from '../../src/lib/painel/agenda'

let n = 0
function ag(status: StatusAgendamento): Agendamento {
  n++
  return {
    id: `ag-${n}`,
    codigo: `COD${n}`,
    status,
    inicio: '2026-10-09T12:00:00Z',
    fim: '2026-10-09T12:40:00Z',
    barbeiroId: 'b1',
    barbeiroNome: 'Rafael',
    servicoNome: 'Corte',
    servicoTipo: 'avulso',
    clienteNome: `Cliente ${n}`,
    clienteTelefone: '11999990000',
  }
}

const TODOS: StatusAgendamento[] = ['pendente', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu']

describe('lerCancelados', () => {
  it('só "1" liga; o resto é desligado', () => {
    expect(lerCancelados('1')).toBe(true)
    expect(lerCancelados(null)).toBe(false)
    expect(lerCancelados('')).toBe(false)
    expect(lerCancelados('0')).toBe(false)
    expect(lerCancelados('true')).toBe(false)
  })
})

describe('filtrarCancelados', () => {
  const lista = TODOS.map(ag)

  it('desligado: tira só o cancelado (não compareceu continua)', () => {
    const status = filtrarCancelados(lista, false).map((a) => a.status)
    expect(status).toEqual(['pendente', 'confirmado', 'concluido', 'nao_compareceu'])
  })

  it('ligado: devolve todos, na mesma ordem', () => {
    expect(filtrarCancelados(lista, true)).toEqual(lista)
  })

  it('não altera a lista original', () => {
    const copia = [...lista]
    filtrarCancelados(lista, false)
    expect(lista).toEqual(copia)
  })

  it('lista vazia continua vazia', () => {
    expect(filtrarCancelados([], false)).toEqual([])
  })
})

describe('contarCancelados', () => {
  it('conta só os cancelados', () => {
    expect(contarCancelados(TODOS.map(ag))).toBe(1)
    expect(contarCancelados([ag('cancelado'), ag('cancelado'), ag('pendente')])).toBe(2)
    expect(contarCancelados([])).toBe(0)
  })
})

describe('colunasComFiltro', () => {
  const coluna = (id: string, status: StatusAgendamento[]): ColunaBarbeiro => ({
    barbeiroId: id,
    nome: id,
    agendamentos: status.map(ag),
    bloqueios: [],
  })
  const colunas = [coluna('b1', ['confirmado', 'cancelado']), coluna('b2', ['cancelado'])]

  it('desligado: tira os cancelados mas mantém todas as colunas', () => {
    const r = colunasComFiltro(colunas, false)
    expect(r.map((c) => c.barbeiroId)).toEqual(['b1', 'b2'])
    expect(r[0].agendamentos.map((a) => a.status)).toEqual(['confirmado'])
    expect(r[1].agendamentos).toEqual([])
  })

  it('ligado: não perde ninguém', () => {
    const r = colunasComFiltro(colunas, true)
    expect(r[0].agendamentos).toHaveLength(2)
    expect(r[1].agendamentos).toHaveLength(1)
  })

  it('os números do resumo não mudam com o filtro (cancelado já fica fora da conta)', () => {
    const todos = colunas.flatMap((c) => c.agendamentos)
    const filtrados = colunasComFiltro(colunas, false).flatMap((c) => c.agendamentos)
    expect(contarAtendimentos(filtrados)).toEqual(contarAtendimentos(todos))
  })
})

describe('colunasComFiltro: cancelados ocultos por coluna', () => {
  const coluna = (id: string, status: StatusAgendamento[]): ColunaBarbeiro => ({
    barbeiroId: id,
    nome: id,
    agendamentos: status.map(ag),
    bloqueios: [],
  })
  const colunas = [coluna('b1', ['confirmado', 'cancelado', 'cancelado']), coluna('b2', ['cancelado']), coluna('b3', [])]

  it('desligado: conta quantos cancelados saíram de cada coluna', () => {
    expect(colunasComFiltro(colunas, false).map((c) => c.canceladosOcultos)).toEqual([2, 1, 0])
  })
  it('ligado: nada fica oculto', () => {
    expect(colunasComFiltro(colunas, true).map((c) => c.canceladosOcultos)).toEqual([0, 0, 0])
  })
})

describe('textoColunaVazia', () => {
  const vazia = { agendamentos: [], bloqueios: [] }
  const um = [ag('pendente')]
  const bloqueio = { id: 'k', barbeiroId: 'b1', barbeiroNome: 'R', inicio: '', fim: '', motivo: '' }

  it('sem nada e sem cancelados ocultos: "Sem agendamentos"', () => {
    expect(textoColunaVazia({ ...vazia, canceladosOcultos: 0 })).toBe('Sem agendamentos')
  })
  it('só cancelados ocultos: diz quantos (singular e plural)', () => {
    expect(textoColunaVazia({ ...vazia, canceladosOcultos: 1 })).toBe('1 cancelado oculto')
    expect(textoColunaVazia({ ...vazia, canceladosOcultos: 3 })).toBe('3 cancelados ocultos')
  })
  it('com agendamento ou bloqueio a coluna não está vazia (null)', () => {
    expect(textoColunaVazia({ agendamentos: um, bloqueios: [], canceladosOcultos: 2 })).toBeNull()
    expect(textoColunaVazia({ agendamentos: [], bloqueios: [bloqueio], canceladosOcultos: 0 })).toBeNull()
  })
})

describe('botão do filtro', () => {
  it('aparece com cancelados no dia, ou com o filtro ligado mesmo sem nenhum', () => {
    expect(mostrarBotaoCancelados(2, false)).toBe(true)
    expect(mostrarBotaoCancelados(2, true)).toBe(true)
    expect(mostrarBotaoCancelados(0, true)).toBe(true)
    expect(mostrarBotaoCancelados(0, false)).toBe(false)
  })
  it('o rótulo troca entre Mostrar e Ocultar e leva sempre o número', () => {
    expect(rotuloBotaoCancelados(2, false)).toBe('Mostrar cancelados (2)')
    expect(rotuloBotaoCancelados(2, true)).toBe('Ocultar cancelados (2)')
    expect(rotuloBotaoCancelados(0, true)).toBe('Ocultar cancelados')
    expect(rotuloBotaoCancelados(0, false)).toBe('Mostrar cancelados')
  })
})

describe('avisoCancelados', () => {
  it('ligou: diz quantos cancelados ficaram visíveis; desligou: diz que ficaram ocultos', () => {
    expect(avisoCancelados(3, true)).toBe('Cancelados visíveis: 3')
    expect(avisoCancelados(0, true)).toBe('Cancelados visíveis: 0')
    expect(avisoCancelados(3, false)).toBe('Cancelados ocultos')
  })
})
