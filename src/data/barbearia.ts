// Dados da barbearia usados pela landing e pelo /agendar. O seed do banco (supabase/seed.sql)
// espelha este arquivo: mesmos slugs, nomes, preços e durações. Se mudar um, mude o outro.
// Fonte: página da MENEZES BARBER's no AppBarber, lida em 14/11/2026.
// Preço sempre em centavos (inteiro): evita erro de arredondamento com número decimal.

export interface Combo {
  slug: string
  numero: number
  nome: string
  itens: string[]
  precoCentavos: number
  duracaoMinutos: number
}

export interface ServicoAvulso {
  slug: string
  nome: string
  /** Frase curta para a tabela de preços da landing. */
  descricao: string
  precoCentavos: number
  duracaoMinutos: number
  /** O preço é "a partir de" (no AppBarber aparece assim). */
  aPartirDe?: boolean
}

export interface Barbeiro {
  slug: string
  nome: string
  especialidade: string
  /** Sem foto de pessoa inventada: a linha mostra o monograma (iniciais). */
  monograma: string
}

export interface FaixaHorario {
  /** 0 = domingo ... 6 = sábado (mesma convenção do Date.getDay). */
  dias: number[]
  rotulo: string
  /** null = fechado. */
  abre: string | null
  fecha: string | null
  /** Pausa do almoço nesses dias. Ausente ou null = sem pausa. */
  almoco?: { inicio: string; fim: string } | null
}

// A Menezes não vende combo fechado: o cliente soma os serviços que quiser.
// A lista fica vazia de propósito. O código de combo (banco e /agendar) continua pronto
// para o dia em que existir um.
export const combos: Combo[] = []

export const servicosAvulsos: ServicoAvulso[] = [
  {
    slug: 'corte-masculino',
    nome: 'Corte Masculino',
    descricao: 'Corte personalizado, com atenção ao acabamento.',
    precoCentavos: 5500,
    duracaoMinutos: 30,
    aPartirDe: true,
  },
  {
    slug: 'cabelo-e-barba',
    nome: 'Cabelo e Barba',
    descricao: 'Corte e barba no mesmo horário.',
    precoCentavos: 9500,
    duracaoMinutos: 60,
    aPartirDe: true,
  },
  {
    slug: 'barboterapia',
    nome: 'Barboterapia',
    descricao: 'Modelagem da barba com toalha quente ou ozônio e massagem na cadeira.',
    precoCentavos: 5500,
    duracaoMinutos: 30,
  },
  {
    slug: 'barboterapia-premium',
    nome: 'Barboterapia Premium',
    descricao: 'A barboterapia com limpeza, esfoliação e sérum facial.',
    precoCentavos: 8500,
    duracaoMinutos: 30,
  },
  {
    slug: 'barba-na-maquina',
    nome: 'Barba na Máquina',
    descricao: 'Aparação e contorno só na máquina, sem navalha.',
    precoCentavos: 4000,
    duracaoMinutos: 30,
  },
  {
    slug: 'limpeza-de-pele',
    nome: 'Limpeza de Pele',
    descricao: 'Tratamento facial com limpeza profunda.',
    precoCentavos: 7990,
    duracaoMinutos: 30,
  },
]

// Nomes como aparecem na aba "Profissionais" do AppBarber.
// TODO: confirmar com o dono quem atende hoje e em que ordem aparecem.
export const barbeiros: Barbeiro[] = [
  { slug: 'alessandro', nome: 'Alessandro', especialidade: 'Barbeiro', monograma: 'AL' },
  { slug: 'jhonathan', nome: 'Jhonathan', especialidade: 'Barbeiro', monograma: 'JH' },
  { slug: 'jose', nome: 'José', especialidade: 'Barbeiro', monograma: 'JO' },
  { slug: 'jose-bonadiman', nome: 'José Bonadiman', especialidade: 'Barbeiro', monograma: 'JB' },
  { slug: 'lucas', nome: 'Lucas', especialidade: 'Barbeiro', monograma: 'LU' },
]

// Horário do AppBarber. Domingo não aparece lá, então fica fechado.
export const horarioFuncionamento: FaixaHorario[] = [
  { dias: [1], rotulo: 'Segunda', abre: '13:00', fecha: '20:00', almoco: null },
  { dias: [2, 3, 4, 5], rotulo: 'Terça a sexta', abre: '09:00', fecha: '20:00', almoco: { inicio: '12:00', fim: '13:30' } },
  { dias: [6], rotulo: 'Sábado', abre: '09:00', fecha: '16:30', almoco: { inicio: '12:00', fim: '13:00' } },
  { dias: [0], rotulo: 'Domingo', abre: null, fecha: null, almoco: null },
]

export const contato = {
  // Só dígitos, com DDI.
  // TESTE: número do dono do repositório. O da barbearia é 5546999833026; volte antes de mostrar ao dono
  // (e o rótulo no Rodape.tsx).
  whatsapp: '5546999325499',
  telefoneFixo: { rotulo: '(46) 3199-0441', tel: '+554631990441' },
  endereco: {
    linha1: 'Rua Itabira, 1166, Centro',
    linha2: 'Pato Branco - PR, 85501-047',
  },
  instagram: 'menezes_barbers',
  instagramUrl: 'https://www.instagram.com/menezes_barbers/',
} as const

// Lista "Comodidades" do AppBarber.
export const comodidades = ['Wi-fi', 'Estacionamento', 'Acessibilidade', 'Atende crianças'] as const

export const mensagemWhatsAppPadrao = 'Olá, pessoal da Menezes! Quero agendar um horário.'

// Quantos dias à frente o cliente pode agendar (hoje + N). Espelha `janela_max_dias`
// da tabela config no banco; o servidor é quem manda, aqui é só para o calendário.
// TODO: confirmar com o dono
export const janelaMaximaDias = 30
