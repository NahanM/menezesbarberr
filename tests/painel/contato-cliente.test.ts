import { describe, it, expect } from 'vitest'
import { linkParaCliente, mensagemParaCliente } from '../../src/lib/agendar/mensagem'
import { mascararTelefone } from '../../src/lib/agendar/dados'
import { paraAgendamento } from '../../src/lib/painel/api'

const d = { nome: 'João & Maria "Ç" Silva', inicio: '2026-10-14T17:30:00+00:00' } // quarta 14/10, 14:30 em SP

describe('mensagemParaCliente', () => {
  it('texto exato, com o primeiro nome e a hora de São Paulo', () => {
    expect(mensagemParaCliente(d)).toBe(
      'Olá, João! Aqui é da Menezes Barber’s, sobre seu horário de quarta 14/10 às 14:30.',
    )
  })
  it('perto da meia-noite usa o dia de São Paulo', () => {
    expect(mensagemParaCliente({ nome: 'Ana', inicio: '2026-10-10T02:30:00Z' })).toContain('sexta 09/10 às 23:30')
  })
})

describe('linkParaCliente', () => {
  it('telefone canônico: wa.me/55... com o texto codificado', () => {
    const link = linkParaCliente('5511999990000', d)
    const [base, query] = link.split('?text=')
    expect(base).toBe('https://wa.me/5511999990000')
    expect(decodeURIComponent(query)).toBe(mensagemParaCliente(d))
    expect(query).not.toMatch(/[ &"]/)
    expect(new URL(link).searchParams.get('text')).toBe(mensagemParaCliente(d))
  })
  it('só dígitos no número, mesmo que venha formatado', () => {
    expect(linkParaCliente('+55 (11) 99999-0000', d).startsWith('https://wa.me/5511999990000?text=')).toBe(true)
  })
  it('telefone sem o 55 (10 ou 11 dígitos) ganha o 55', () => {
    expect(linkParaCliente('11999990000', d).startsWith('https://wa.me/5511999990000?')).toBe(true)
    expect(linkParaCliente('1133334444', d).startsWith('https://wa.me/551133334444?')).toBe(true)
  })
  it('nome com caracteres de URL não escapa do parâmetro text', () => {
    const link = linkParaCliente('5511999990000', { ...d, nome: 'A&text=hack#x' })
    expect(new URL(link).searchParams.getAll('text')).toHaveLength(1)
    expect(new URL(link).hash).toBe('')
  })
})

describe('telefone na tela', () => {
  it('canônico de 13 e de 12 dígitos', () => {
    expect(mascararTelefone('5511999990000')).toBe('(11) 99999-0000')
    expect(mascararTelefone('551133334444')).toBe('(11) 3333-4444')
  })
})

describe('paraAgendamento', () => {
  it('traduz a linha do banco (snake_case) para o tipo da tela', () => {
    expect(
      paraAgendamento({
        id: 'i', codigo: 'K7MQ2X', status: 'confirmado', inicio: 'a', fim: 'b', barbeiro_id: 'bi', barbeiro_nome: 'Rafael',
        servico_nome: 'Corte', servico_tipo: 'avulso', cliente_nome: 'Ana', cliente_telefone: '5511999990000',
      }),
    ).toEqual({
      id: 'i', codigo: 'K7MQ2X', status: 'confirmado', inicio: 'a', fim: 'b', barbeiroId: 'bi', barbeiroNome: 'Rafael',
      servicoNome: 'Corte', servicoTipo: 'avulso', clienteNome: 'Ana', clienteTelefone: '5511999990000', expiradoEm: null,
    })
  })

  it('leva expirado_em para expiradoEm', () => {
    const linha = {
      id: 'i', codigo: 'K7MQ2X', status: 'cancelado' as const, inicio: 'a', fim: 'b', barbeiro_id: 'bi', barbeiro_nome: 'Rafael',
      servico_nome: 'Corte', servico_tipo: 'avulso', cliente_nome: 'Ana', cliente_telefone: '5511999990000',
      expirado_em: '2026-10-24T12:00:00Z',
    }
    expect(paraAgendamento(linha).expiradoEm).toBe('2026-10-24T12:00:00Z')
  })
})
