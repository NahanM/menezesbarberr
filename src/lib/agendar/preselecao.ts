// Lê a pré-seleção que vem na URL de /agendar. Exemplos:
//   /agendar?combo=essencial          (botão "Agendar" de um combo)
//   /agendar?servico=barba&barbeiro=diego
// Qualquer valor que não exista em barbearia.ts é ignorado: a URL pode ser
// digitada por qualquer pessoa, então nunca confiamos nela.

import { barbeiros, combos, servicosAvulsos } from '../../data/barbearia.ts'

export interface PreSelecao {
  combo: string | null
  servico: string | null
  barbeiro: string | null
}

/** Devolve o valor se ele estiver na lista de slugs válidos; senão, null. */
function slugValido(valor: string | null, validos: readonly string[]): string | null {
  return valor !== null && validos.includes(valor) ? valor : null
}

/** `searchParams` é o objeto que o React Router entrega (useSearchParams). */
export function lerPreSelecao(searchParams: URLSearchParams): PreSelecao {
  return {
    combo: slugValido(
      searchParams.get('combo'),
      combos.map((c) => c.slug),
    ),
    servico: slugValido(
      searchParams.get('servico'),
      servicosAvulsos.map((s) => s.slug),
    ),
    barbeiro: slugValido(
      searchParams.get('barbeiro'),
      barbeiros.map((b) => b.slug),
    ),
  }
}
