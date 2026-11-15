import { useEffect, useRef, useState } from 'react'
import type { DadosCliente } from '../lib/agendar/dados.ts'
import type { DiaSelecionavel } from '../lib/agendar/datas.ts'
import type { EstadoAgendar } from '../lib/agendar/estado.ts'
import { lerRascunho, salvarRascunho, type Rascunho } from '../lib/agendar/rascunho.ts'

/**
 * Lê o rascunho uma vez, ao abrir a página. Só vale quando a pessoa já está dentro do fluxo
 * (?passo= na URL: recarregou ou voltou/avançou pelo navegador). Entrou limpo (botão "Agendar" da
 * landing, /agendar puro)? Devolve null e o fluxo começa do zero.
 */
export function useRascunhoInicial(
  dias: DiaSelecionavel[],
  dentroDoFluxo: boolean,
): Rascunho | null {
  const [rascunho] = useState(() => (dentroDoFluxo ? lerRascunho(dias) : null))
  return rascunho
}

/**
 * Copia escolhas e dados para o sessionStorage a cada mudança.
 *
 * A validade (30 min) conta desde a última ALTERAÇÃO: se a página só foi aberta ou recarregada
 * com o rascunho restaurado, nada é regravado e o prazo não anda. Quando o fluxo começou limpo,
 * grava já na abertura: isso apaga um rascunho velho que sobrou de uma tentativa anterior.
 */
export function useSalvarRascunho(
  estado: EstadoAgendar,
  dados: DadosCliente,
  restaurado: Rascunho | null,
) {
  const inicial = useRef({ estado, dados })
  useEffect(() => {
    const intocado = estado === inicial.current.estado && dados === inicial.current.dados
    if (restaurado !== null && intocado) return
    salvarRascunho(estado, dados)
  }, [estado, dados, restaurado])
}
