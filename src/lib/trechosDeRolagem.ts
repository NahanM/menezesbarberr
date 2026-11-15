// Matemática dos trechos de rolagem (entrada, pausa e saída) das seções animadas.
// Tudo em "unidades de etapa": 1 unidade = a rolagem de UMA frase (ou combo). No fim, vira fração
// (0 a 1) da rolagem total, que é o que o useTransform do Motion espera. Sem DOM: dá para testar.

export type Trecho = [inicio: number, fim: number]

export interface Fases {
  entrada: number
  pausa: number
  saida: number
}

/** Só a proporção importa: 35/30/35 e 0,35/0,30/0,35 dão o mesmo resultado. A soma passa a ser 1. */
export function normalizarFases({ entrada, pausa, saida }: Fases): Fases {
  const soma = entrada + pausa + saida
  if (!(soma > 0) || entrada < 0 || pausa < 0 || saida < 0) return { entrada: 0.35, pausa: 0.3, saida: 0.35 }
  return { entrada: entrada / soma, pausa: pausa / soma, saida: saida / soma }
}

export interface EtapaFrase {
  /** Trecho em que a frase entra (crossfade com a saída da anterior). A primeira já está no lugar: [0, 0]. */
  entrada: Trecho
  /** Trecho em que a frase fica inteira e parada. */
  pausa: Trecho
  /** Trecho em que a frase sai (crossfade com a entrada da próxima, ou do fechamento). */
  saida: Trecho
}

export interface LinhaDoTempoFrases {
  /** Rolagem total, em etapas: n frases, mais a pausa do fechamento, mais o respiro (n + pausa + respiro). */
  totalEtapas: number
  /** Trechos (fração 0 a 1 da rolagem total) da frase i. */
  frase: (i: number) => EtapaFrase
  /** Trechos do fechamento (depois da última frase): entrada (crossfade) e pausa. */
  fechamento: { entrada: Trecho; pausa: Trecho }
}

/**
 * Frases uma depois da outra, com crossfade: a saída da frase i e a entrada da i+1 acontecem no
 * MESMO trecho de rolagem, então nunca sobra um vão com a tela vazia.
 *
 * A etapa de cada frase vale 1 (= os vh da config) e se divide em PAUSA (a frase parada, [i, i+pausa])
 * e TROCA (o resto: [i+pausa, i+1]). A troca é a soma de entrada e saída: elas dividem o mesmo trecho.
 * `sobreposicao` (0 a 0,9) é quanto o fim da entrada e o começo da saída se encavalam:
 * com 0 a frase nova só termina de entrar quando a velha termina de sair (no meio, as duas estão em 50%);
 * com 0,25 a nova já está inteira um pouco antes da velha sumir (no meio, as duas passam de 60%).
 * O fechamento é a etapa n: entra no crossfade e fica parado (a seção solta a pessoa depois da pausa).
 * `respiro` (em etapas, padrão 0) alonga o fim: é rolagem extra com o fechamento parado, para a saída
 * da seção não ser seca quando a pessoa rola rápido. Só estica a pausa do fechamento; as frases não mudam.
 */
export function linhaDoTempoFrases(n: number, bruto: Fases, sobreposicao = 0.25, respiro = 0): LinhaDoTempoFrases {
  const f = normalizarFases(bruto)
  const r = Math.max(0, respiro)
  const o = Math.min(0.9, Math.max(0, sobreposicao))
  const troca = f.entrada + f.saida // = 1 - pausa
  const total = n + f.pausa + r
  const frac = (a: number, b: number): Trecho => [a / total, b / total]
  // Troca da etapa i para a i+1: começa quando a pausa de i termina e acaba em i+1.
  const entrada = (i: number): Trecho => frac(i - 1 + f.pausa, i - 1 + f.pausa + troca * (1 - o))
  const saida = (i: number): Trecho => frac(i + f.pausa + troca * o, i + 1)
  return {
    totalEtapas: total,
    frase: (i) => ({
      entrada: i === 0 ? [0, 0] : entrada(i),
      pausa: frac(i, i + f.pausa),
      saida: saida(i),
    }),
    fechamento: {
      entrada: entrada(n),
      pausa: frac(n, n + f.pausa + r),
    },
  }
}

export interface LinhaDoTempoPosts {
  /** Rolagem total, em etapas. */
  totalEtapas: number
  /** Trecho em que o post i (a partir do 2º) sobe e cobre o anterior. */
  sobe: (i: number) => Trecho
  /** Trecho em que o post i vai sendo coberto (escurece e encolhe). Termina junto com a subida do próximo. */
  coberto: (i: number) => Trecho
  /** Ponto (fração 0 a 1) no meio da pausa do post i: ele está inteiro, parado e por cima. */
  meioDaPausa: (i: number) => number
}

/**
 * Posts empilhados: a saída de um post é a entrada do seguinte (um cobre o outro), então as
 * etapas se sobrepõem: o post i sobe em [i*(e+p), i*(e+p) + e] e fica parado por `pausa` até o próximo subir.
 */
export function linhaDoTempoPosts(n: number, bruto: Fases): LinhaDoTempoPosts {
  const f = normalizarFases(bruto)
  const passo = f.entrada + f.pausa
  const total = n * passo
  const inicio = (i: number) => i * passo
  return {
    totalEtapas: total,
    sobe: (i) => [inicio(i) / total, (inicio(i) + f.entrada) / total],
    coberto: (i) => {
      const fim = inicio(i + 1) + f.entrada
      return [Math.max(0, fim - f.saida) / total, fim / total]
    },
    meioDaPausa: (i) => (inicio(i) + f.entrada + f.pausa / 2) / total,
  }
}
