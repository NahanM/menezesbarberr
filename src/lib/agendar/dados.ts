// Nome e WhatsApp do cliente: máscara e validação. Funções puras.
// A validação aqui é só conforto (avisar antes de enviar). Quem decide é o servidor
// (criar_agendamento devolve URB03/URB04); as regras abaixo espelham as dele.

export interface DadosCliente {
  nome: string
  /** Como está no campo, com máscara: "(11) 99999-9999". */
  telefone: string
}

export type CampoDados = 'nome' | 'telefone'

/**
 * Caracteres invisíveis que o servidor também descarta: largura zero, marcas de direção,
 * controles bidi (U+202A-202E), U+2060-2064 e BOM. O U+00AD (hífen suave) é extra, só do front.
 */
const INVISIVEIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g

/** Nome pronto para enviar: sem invisíveis, sem espaços nas pontas nem repetidos. */
export function limparNome(nome: string): string {
  return nome.replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim()
}

/** Só os dígitos do telefone. */
export function telefoneDigitos(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

/**
 * Máscara enquanto a pessoa digita: "11999999999" vira "(11) 99999-9999".
 * Aceita no máximo 11 dígitos (DDD + 9 dígitos). Celular antigo de 10 dígitos
 * fica "(11) 9999-9999". Se o texto colado começar com +55, o 55 é descartado.
 */
export function mascararTelefone(texto: string): string {
  let d = telefoneDigitos(texto)
  // Colou "+55 11 99999-9999" ou "5511999999999": tira o DDI para não virar DDD 55.
  if (/^\s*\+/.test(texto) && d.startsWith('55') && d.length > 11) d = d.slice(2)
  else if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)

  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (d.length <= 6) return `(${ddd}) ${resto}`
  // 10 dígitos: 4+4. 11 dígitos: 5+4.
  const corte = d.length === 11 ? 5 : 4
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}

/** Mensagem de erro do nome, ou null se está bom. */
export function validarNome(nome: string): string | null {
  const limpo = limparNome(nome)
  // Conta code points ([...texto]), como o servidor: um emoji vale 1, não 2.
  const tamanho = [...limpo].length
  if (tamanho < 2 || tamanho > 60) return 'Nome com 2 a 60 caracteres.'
  const letras = limpo.match(/\p{L}/gu)?.length ?? 0
  if (letras < 2) return 'Use pelo menos 2 letras no nome.'
  return null
}

/** Mensagem de erro do telefone, ou null se está bom. */
export function validarTelefone(telefone: string): string | null {
  const d = telefoneDigitos(telefone)
  if (d.length < 10 || d.length > 11) return 'WhatsApp com DDD: (11) 99999-9999.'
  if (d.startsWith('0') || d[1] === '0') return 'DDD inválido.'
  return null
}

/** Os dois campos estão válidos? */
export function dadosValidos(dados: DadosCliente): boolean {
  return validarNome(dados.nome) === null && validarTelefone(dados.telefone) === null
}
