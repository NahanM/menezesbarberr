import { describe, expect, it } from 'vitest'
import {
  dadosValidos,
  limparNome,
  mascararTelefone,
  telefoneDigitos,
  validarNome,
  validarTelefone,
} from '../../src/lib/agendar/dados.ts'

// Regras espelhadas do servidor: migrations 20261009150000 (telefone canônico) e 180000 (nome).

describe('mascararTelefone', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['119999', '(11) 9999'],
    ['1199998', '(11) 9999-8'],
    ['1199998888', '(11) 9999-8888'],
    ['11999998888', '(11) 99999-8888'],
  ])('parcial %j -> %j', (entrada, saida) => {
    expect(mascararTelefone(entrada)).toBe(saida)
  })

  it('é idempotente (reaplicar sobre o próprio resultado não muda nada)', () => {
    for (const n of ['1', '119', '1199998', '1199998888', '11999998888']) {
      const m = mascararTelefone(n)
      expect(mascararTelefone(m)).toBe(m)
    }
  })

  it('cola com +55 e descarta o DDI', () => {
    expect(mascararTelefone('+55 11 99999-8888')).toBe('(11) 99999-8888')
    expect(mascararTelefone('5511999998888')).toBe('(11) 99999-8888')
    expect(mascararTelefone('+55 (11) 9999-8888')).toBe('(11) 9999-8888')
  })

  it('DDD 55 (RS) com 11 dígitos não é confundido com DDI', () => {
    expect(mascararTelefone('55999998888')).toBe('(55) 99999-8888')
    expect(mascararTelefone('+55 55 99999-8888')).toBe('(55) 99999-8888')
  })

  it('ignora letras e símbolos', () => {
    expect(mascararTelefone('abc')).toBe('')
    expect(mascararTelefone('1a1b9c9d9e9f9g8h8i8j8')).toBe('(11) 99999-8888')
    expect(mascararTelefone('tel: 11 99999-8888 ok')).toBe('(11) 99999-8888')
  })

  it('corta em 11 dígitos', () => {
    expect(mascararTelefone('119999988889999')).toBe('(11) 99999-8888')
  })
})

describe('limparNome', () => {
  it('tira pontas e colapsa espaços, tab e quebra de linha', () => {
    expect(limparNome('  João   Silva  ')).toBe('João Silva')
    expect(limparNome('João\nSilva')).toBe('João Silva')
    expect(limparNome('João\r\n\tSilva')).toBe('João Silva')
  })
  it('remove invisíveis (largura zero, BOM, soft hyphen)', () => {
    expect(limparNome('Jo\u200Bão')).toBe('João')
    expect(limparNome('\uFEFFAna\u2060')).toBe('Ana')
    expect(limparNome('A\u00ADna')).toBe('Ana')
  })
  it('só espaços e invisíveis vira vazio', () => {
    expect(limparNome('   \u200B \n ')).toBe('')
  })
})

describe('validarNome', () => {
  it('aceita 2 a 60 caracteres', () => {
    expect(validarNome('Jo')).toBeNull()
    expect(validarNome('a'.repeat(60))).toBeNull()
    expect(validarNome('José Ângelo D\u2019Ávila')).toBeNull()
    expect(validarNome('Zoë Müller-Çelik')).toBeNull()
  })
  it('recusa 1 e 61 caracteres', () => {
    expect(validarNome('J')).not.toBeNull()
    expect(validarNome('a'.repeat(61))).not.toBeNull()
  })
  it('mede depois de limpar: espaços nas pontas não contam', () => {
    expect(validarNome(' ' + 'a'.repeat(60) + ' ')).toBeNull()
    expect(validarNome('  J  ')).not.toBeNull()
  })
  it('só espaços, só invisíveis, quebra de linha: recusa', () => {
    expect(validarNome('     ')).not.toBeNull()
    expect(validarNome('\u200B\u200B\u200B')).not.toBeNull()
    expect(validarNome('\n\n')).not.toBeNull()
    expect(validarNome('J\n')).not.toBeNull()
  })
  it('exige 2 letras (como o servidor): "1 2" e "A1" recusados', () => {
    expect(validarNome('12')).not.toBeNull()
    expect(validarNome('A1')).not.toBeNull()
    expect(validarNome('A B')).toBeNull()
  })
  it('quebra de linha no meio vira espaço e é aceita', () => {
    expect(validarNome('Jo\nao')).toBeNull()
  })
  it('controles bidi (U+202A-202E) não podem fazer um nome inválido passar', () => {
    // Servidor remove U+202E e conta 1 caractere: "A" + bidi + "1" é inválido nos dois.
    expect(validarNome('A\u202E1')).not.toBeNull()
  })
})

describe('validarTelefone', () => {
  it('aceita 10 e 11 dígitos, com ou sem máscara', () => {
    expect(validarTelefone('1199998888')).toBeNull()
    expect(validarTelefone('11999998888')).toBeNull()
    expect(validarTelefone('(11) 99999-8888')).toBeNull()
  })
  it('recusa 9 e menos, vazio, letras', () => {
    expect(validarTelefone('')).not.toBeNull()
    expect(validarTelefone('119999888')).not.toBeNull()
    expect(validarTelefone('abc')).not.toBeNull()
  })
  it('DDD com zero é recusado', () => {
    expect(validarTelefone('0199998888')).not.toBeNull()
    expect(validarTelefone('1099998888')).not.toBeNull()
  })
  it('com 55 na frente: o campo corta em 11 via máscara, então sempre fica válido', () => {
    const m = mascararTelefone('+55 11 99999-8888')
    expect(validarTelefone(m)).toBeNull()
    expect(telefoneDigitos(m)).toBe('11999998888')
  })
  it('12 e 13 dígitos crus (com 55) são recusados pela validação do campo; o servidor os aceitaria', () => {
    // Documenta a diferença: o campo nunca produz 12-13 dígitos (a máscara tira o DDI).
    expect(validarTelefone('551199998888')).not.toBeNull()
    expect(validarTelefone('5511999998888')).not.toBeNull()
  })
})

describe('dadosValidos', () => {
  it('exige os dois', () => {
    expect(dadosValidos({ nome: 'João', telefone: '(11) 99999-8888' })).toBe(true)
    expect(dadosValidos({ nome: 'J', telefone: '(11) 99999-8888' })).toBe(false)
    expect(dadosValidos({ nome: 'João', telefone: '' })).toBe(false)
  })
})

describe('paridade com o servidor (invisíveis e code points)', () => {
  it('remove U+2061-2064 e controles bidi', () => {
    expect(limparNome('Jo\u2061\u2062\u2063\u2064ão')).toBe('João')
    expect(limparNome('\u202EJoão\u202C')).toBe('João')
  })

  it('conta code points: 2 letras + 58 emojis cabem (60), +59 não', () => {
    expect(validarNome('Jo' + '😀'.repeat(58))).toBeNull()
    expect(validarNome('Jo' + '😀'.repeat(59))).not.toBeNull()
  })
})
