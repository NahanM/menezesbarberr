// Estado do fluxo /agendar e as regras de "em que passo estou". Tudo puro (sem React),
// por isso dá para testar sem abrir o navegador.
//
// Os 5 passos da tela:
//   1 Serviço  2 Barbeiro  3 Data e hora  4 Seus dados  5 Revisão

import { MAX_AVULSOS, ehCombo, todosOsServicos } from './catalogo.ts'
import type { DiaISO, DiaSelecionavel } from './datas.ts'
import type { PreSelecao } from './preselecao.ts'

export const TOTAL_PASSOS = 5

export interface EstadoAgendar {
  /**
   * Slugs escolhidos: um combo sozinho, OU um ou mais avulsos (até MAX_AVULSOS), sempre na
   * ordem do catálogo. Vazio = nada escolhido ainda.
   */
  servicos: string[]
  /** Slug do barbeiro; null = "sem preferência" (o servidor escolhe). */
  barbeiro: string | null
  /** Dia escolhido, "AAAA-MM-DD". */
  dia: DiaISO | null
  /** Início escolhido (timestamptz em texto ISO), um dos horários devolvidos pelo servidor. */
  hora: string | null
  /**
   * true = o horário foi escolhido para OUTRO serviço/barbeiro e ainda não foi conferido contra
   * a lista de horários livres. Enquanto isso o fluxo não passa do passo 3 (ver passoMaximo).
   */
  horaPorConferir: boolean
}

/** Aviso quando o horário que a pessoa tinha não cabe mais depois de trocar serviço ou barbeiro. */
export const AVISO_HORA_NAO_CABE = 'Esse horário não cabe mais com a nova escolha. Escolha outro.'

export type AcaoAgendar =
  /**
   * Combo: vira a única escolha. Avulso: entra ou sai da soma (e derruba um combo, se houver).
   * Avulso novo além do limite é ignorado.
   */
  | { tipo: 'alternar-servico'; slug: string }
  | { tipo: 'escolher-barbeiro'; slug: string | null }
  | { tipo: 'escolher-dia'; dia: DiaISO }
  | { tipo: 'escolher-hora'; hora: string }
  /** Horário perdido (alguém pegou antes): some a escolha e o cliente escolhe de novo. */
  | { tipo: 'limpar-hora' }
  /** O horário guardado continua na lista de livres do novo serviço/barbeiro: vale de novo. */
  | { tipo: 'hora-conferida' }

/** Primeiro dia em que a barbearia abre (ou null se a lista não tiver nenhum). */
export function primeiroDiaAberto(dias: DiaSelecionavel[]): DiaISO | null {
  return dias.find((d) => !d.fechado)?.iso ?? null
}

/** Próximo dia aberto DEPOIS de `dia`; null se não houver mais nenhum na janela. */
export function proximoDiaAberto(dias: DiaSelecionavel[], dia: DiaISO): DiaISO | null {
  return dias.find((d) => !d.fechado && d.iso > dia)?.iso ?? null
}

/** Ordena pela posição no catálogo (o payload fica estável, qualquer que seja a ordem dos cliques). */
function emOrdemDoCatalogo(slugs: string[]): string[] {
  const posicao = (slug: string) => todosOsServicos.findIndex((s) => s.slug === slug)
  return [...slugs].sort((a, b) => posicao(a) - posicao(b))
}

/** Próxima lista de serviços depois de tocar em "slug". Devolve a MESMA lista se nada muda. */
export function alternarServico(atuais: string[], slug: string): string[] {
  if (ehCombo(slug)) return atuais.length === 1 && atuais[0] === slug ? atuais : [slug]
  // Avulso: se havia combo, ele sai.
  const base = atuais.filter((s) => !ehCombo(s))
  if (base.includes(slug)) return base.filter((s) => s !== slug)
  if (base.length >= MAX_AVULSOS) return atuais
  return emOrdemDoCatalogo([...base, slug])
}

/**
 * Estado de partida. Se a URL trouxe ?combo e ?servico, o combo ganha.
 * O dia já começa no primeiro dia aberto para o cliente ver horários sem um toque extra.
 */
export function estadoInicial(pre: PreSelecao, dias: DiaSelecionavel[]): EstadoAgendar {
  return {
    servicos: pre.combo !== null ? [pre.combo] : pre.servico !== null ? [pre.servico] : [],
    barbeiro: pre.barbeiro,
    dia: primeiroDiaAberto(dias),
    hora: null,
    horaPorConferir: false,
  }
}

/**
 * Regras de limpeza:
 *  - Trocar o DIA apaga o horário (ele pertence àquele dia).
 *  - Trocar serviço ou barbeiro MANTÉM o horário, mas marca `horaPorConferir`: a tela confere
 *    se ele ainda está livre para a nova escolha (ver Agendar.tsx) em vez de fazer a pessoa
 *    escolher tudo de novo.
 */
export function reduzir(estado: EstadoAgendar, acao: AcaoAgendar): EstadoAgendar {
  switch (acao.tipo) {
    case 'alternar-servico': {
      const servicos = alternarServico(estado.servicos, acao.slug)
      return servicos === estado.servicos
        ? estado
        : { ...estado, servicos, horaPorConferir: estado.hora !== null }
    }
    case 'escolher-barbeiro':
      return acao.slug === estado.barbeiro
        ? estado
        : { ...estado, barbeiro: acao.slug, horaPorConferir: estado.hora !== null }
    case 'escolher-dia':
      return acao.dia === estado.dia
        ? estado
        : { ...estado, dia: acao.dia, hora: null, horaPorConferir: false }
    case 'escolher-hora':
      return { ...estado, hora: acao.hora, horaPorConferir: false }
    case 'limpar-hora':
      return { ...estado, hora: null, horaPorConferir: false }
    case 'hora-conferida':
      return estado.horaPorConferir ? { ...estado, horaPorConferir: false } : estado
  }
}

/** Passo mais distante que o cliente já pode abrir com o que escolheu até agora. */
export function passoMaximo(estado: EstadoAgendar, dadosValidos = false): number {
  if (estado.servicos.length === 0) return 1
  if (estado.hora === null || estado.dia === null) return 3
  // Horário ainda não conferido para o serviço/barbeiro atuais: a conferência acontece no passo 3.
  if (estado.horaPorConferir) return 3
  // O passo 5 (revisão) só abre com nome e WhatsApp válidos.
  return dadosValidos ? 5 : 4
}

/**
 * Passo que a tela mostra. `passoNaUrl` é o texto de ?passo=.
 *  - Sem ?passo: vale `passoPadrao`. A página passa 2 quando abriu com serviço pré-selecionado
 *    (botão "Agendar" da landing) e 1 nos outros casos. É fixo desde a abertura: se dependesse
 *    do estado atual, escolher um serviço no passo 1 já pularia sozinho para o passo 2.
 *  - Com ?passo: vale, mas nunca além do que o estado permite (ex.: recarregou a página e perdeu as escolhas).
 */
export function passoResolvido(
  passoNaUrl: string | null,
  estado: EstadoAgendar,
  passoPadrao = 1,
  dadosValidos = false,
): number {
  const maximo = passoMaximo(estado, dadosValidos)
  const pedido = passoNaUrl === null ? NaN : Number.parseInt(passoNaUrl, 10)
  const desejado = Number.isNaN(pedido) ? passoPadrao : pedido
  return Math.min(Math.max(desejado, 1), maximo)
}
