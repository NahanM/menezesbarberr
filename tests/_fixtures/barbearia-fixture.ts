// CATÁLOGO DE TESTE (não é o catálogo real da barbearia).
// Os testes de regra (agendar e painel) foram escritos em cima destes dados fictícios: 3 combos,
// 6 avulsos, 3 barbeiros, segunda e domingo fechados, sábado até 18:00. Eles trocam o módulo
// src/data/barbearia.ts por este arquivo com vi.mock, para a regra ser testada sem depender do
// catálogo de verdade (que não tem combo e abre na segunda). O catálogo real tem o seu próprio
// teste em tests/dados-menezes.test.ts.

// Dados da barbearia usados pela landing (e, mais tarde, como base do seed do banco).
// Tudo marcado com TODO é fictício e precisa ser confirmado com o dono antes de ir ao ar.
// Preço sempre em centavos (inteiro): evita erro de arredondamento com número decimal.

export interface Combo {
  slug: 'essencial' | 'cuidado-completo' | 'experiencia-premium'
  numero: 1 | 2 | 3
  nome: string
  itens: string[]
  precoCentavos: number
  duracaoMinutos: number
}

export interface ServicoAvulso {
  slug: string
  nome: string
  precoCentavos: number
  duracaoMinutos: number
}

export interface Barbeiro {
  slug: string
  nome: string
  especialidade: string
  /** Sem foto de pessoa inventada: o card mostra o monograma (iniciais). */
  monograma: string
}

export interface FaixaHorario {
  /** 0 = domingo ... 6 = sábado (mesma convenção do Date.getDay). */
  dias: number[]
  rotulo: string
  /** null = fechado. */
  abre: string | null
  fecha: string | null
}

// Preço e itens dos combos são reais (CLAUDE.md). A duração é fictícia.
export const combos: Combo[] = [
  {
    slug: 'essencial',
    numero: 1,
    nome: 'Essencial',
    itens: ['Corte', 'Sobrancelha', 'Limpeza facial'],
    precoCentavos: 8000,
    duracaoMinutos: 60, // TODO: confirmar com o dono
  },
  {
    slug: 'cuidado-completo',
    numero: 2,
    nome: 'Cuidado Completo',
    itens: [
      'Corte',
      'Barba',
      'Depilação de nariz',
      'Depilação de orelha',
      'Sobrancelha',
      'Hidratação capilar',
    ],
    precoCentavos: 14500,
    duracaoMinutos: 90, // TODO: confirmar com o dono
  },
  {
    slug: 'experiencia-premium',
    numero: 3,
    nome: 'Experiência Premium',
    itens: [
      'Corte',
      'Barba',
      'Depilação de nariz',
      'Hidratação capilar',
      'Limpeza facial',
      'Sobrancelha',
    ],
    precoCentavos: 16000,
    duracaoMinutos: 105, // TODO: confirmar com o dono
  },
]

// TODO: confirmar com o dono (lista, preços e durações são fictícios)
export const servicosAvulsos: ServicoAvulso[] = [
  { slug: 'corte', nome: 'Corte', precoCentavos: 5000, duracaoMinutos: 40 },
  { slug: 'barba', nome: 'Barba', precoCentavos: 4000, duracaoMinutos: 30 },
  { slug: 'sobrancelha', nome: 'Sobrancelha', precoCentavos: 1500, duracaoMinutos: 15 },
  { slug: 'limpeza-facial', nome: 'Limpeza facial', precoCentavos: 3500, duracaoMinutos: 30 },
  { slug: 'hidratacao', nome: 'Hidratação capilar', precoCentavos: 3000, duracaoMinutos: 30 },
  { slug: 'depilacao', nome: 'Depilação nariz e orelha', precoCentavos: 2000, duracaoMinutos: 15 },
]

// TODO: confirmar com o dono (nomes e especialidades são fictícios)
export const barbeiros: Barbeiro[] = [
  { slug: 'rafael', nome: 'Rafael', especialidade: 'Degradê e risco', monograma: 'RA' },
  { slug: 'diego', nome: 'Diego', especialidade: 'Barba e navalha', monograma: 'DI' },
  { slug: 'caio', nome: 'Caio', especialidade: 'Corte clássico', monograma: 'CA' },
]

// TODO: confirmar com o dono
export const horarioFuncionamento: FaixaHorario[] = [
  { dias: [1], rotulo: 'Segunda', abre: null, fecha: null },
  { dias: [2, 3, 4, 5], rotulo: 'Terça a sexta', abre: '09:00', fecha: '20:00' },
  { dias: [6], rotulo: 'Sábado', abre: '09:00', fecha: '18:00' },
  { dias: [0], rotulo: 'Domingo', abre: null, fecha: null },
]

// TODO: confirmar com o dono
export const intervaloAlmoco = { inicio: '12:00', fim: '13:00' }

export const contato = {
  // Só dígitos, com DDI. TODO: confirmar com o dono (número fictício)
  whatsapp: '5511900000000',
  // TODO: confirmar com o dono (endereço fictício)
  endereco: {
    linha1: 'Rua Exemplo, 123',
    linha2: 'Centro, São Paulo - SP',
  },
  // Visto nas referências. TODO: confirmar com o dono
  instagram: 'urbz.barber',
  instagramUrl: 'https://www.instagram.com/urbz.barber/',
} as const

export const mensagemWhatsAppPadrao = 'Olá, pessoal da Menezes! Quero agendar um horário.'

// Quantos dias à frente o cliente pode agendar (hoje + N). Espelha `janela_max_dias`
// da tabela config no banco; o servidor é quem manda, aqui é só para o calendário.
// TODO: confirmar com o dono
export const janelaMaximaDias = 30
