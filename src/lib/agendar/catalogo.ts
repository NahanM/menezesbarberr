// Catálogo do front: junta combos e avulsos numa lista só, para a tela de agendamento
// tratar "serviço" de um jeito único. Os slugs são os mesmos do banco (ver DECISOES.md).

import { barbeiros, combos, servicosAvulsos, type Barbeiro } from '../../data/barbearia.ts'

export interface ServicoEscolhivel {
  slug: string
  nome: string
  precoCentavos: number
  duracaoMinutos: number
  tipo: 'combo' | 'avulso'
}

/** Combos primeiro, depois os avulsos. */
export const todosOsServicos: ServicoEscolhivel[] = [
  ...combos.map((c) => ({
    slug: c.slug,
    nome: c.nome,
    precoCentavos: c.precoCentavos,
    duracaoMinutos: c.duracaoMinutos,
    tipo: 'combo' as const,
  })),
  ...servicosAvulsos.map((s) => ({
    slug: s.slug,
    nome: s.nome,
    precoCentavos: s.precoCentavos,
    duracaoMinutos: s.duracaoMinutos,
    tipo: 'avulso' as const,
  })),
]

export function buscarServico(slug: string | null): ServicoEscolhivel | undefined {
  return slug === null ? undefined : todosOsServicos.find((s) => s.slug === slug)
}

/** Máximo de avulsos somados num agendamento (o servidor recusa mais que isso com URB16). */
export const MAX_AVULSOS = 5

export function ehCombo(slug: string): boolean {
  return buscarServico(slug)?.tipo === 'combo'
}

export interface ResumoServicos {
  /** Nomes juntos, como o servidor devolve: "Corte + Sobrancelha". */
  nome: string
  precoCentavos: number
  duracaoMinutos: number
  /** Quantos serviços entram na soma (um combo conta como 1). */
  quantidade: number
}

/**
 * Soma nome, preço e duração dos serviços escolhidos, na ordem recebida.
 * Slug fora do catálogo é ignorado; sem nenhum válido devolve undefined.
 * O servidor refaz a conta: esta é só a prévia que a tela mostra.
 */
export function resumirServicos(slugs: readonly string[]): ResumoServicos | undefined {
  const itens = slugs.map(buscarServico).filter((s) => s !== undefined)
  if (itens.length === 0) return undefined
  return {
    nome: itens.map((s) => s.nome).join(' + '),
    precoCentavos: itens.reduce((soma, s) => soma + s.precoCentavos, 0),
    duracaoMinutos: itens.reduce((soma, s) => soma + s.duracaoMinutos, 0),
    quantidade: itens.length,
  }
}

export function buscarBarbeiro(slug: string | null): Barbeiro | undefined {
  return slug === null ? undefined : barbeiros.find((b) => b.slug === slug)
}
