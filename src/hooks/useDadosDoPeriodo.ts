import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiaISO } from '../lib/agendar/datas.ts'
import type { Agendamento, Bloqueio } from '../lib/painel/agenda.ts'
import { buscarDadosDoPeriodo, type DadosDoPeriodo, type ResultadoPainel } from '../lib/painel/api.ts'

export type EstadoPeriodo =
  | { status: 'carregando' }
  | { status: 'erro' }
  | { status: 'ok'; dados: DadosDoPeriodo }

/** De quanto em quanto tempo a agenda aberta se atualiza sozinha, sem piscar. */
const ATUALIZAR_A_CADA_MS = 60_000

interface Guardado {
  /** Para qual pedido é esta resposta. */
  chave: string
  resultado: ResultadoPainel<DadosDoPeriodo>
}

/** Comandos que a tela pode dar à busca em andamento (ver `useDadosDoPeriodo`). */
export interface ComandosDoPeriodo {
  atualizar: () => void
  aplicar: (agendamento: Agendamento) => void
  aplicarBloqueios: (mudar: (atuais: Bloqueio[]) => Bloqueio[]) => void
}

type Comandos = ComandosDoPeriodo

/**
 * Busca agenda, bloqueios e barbeiros de um período (de..ate, inclusive). Base do dia e da semana.
 *
 * O status é DERIVADO (como em useHorarios): a resposta guardada só vale se a chave dela for a do
 * pedido atual. Resposta de um período que já não é o escolhido, ou de uma tentativa anterior, é
 * descartada e a tela fica em "carregando" até chegar a certa. Por isso uma resposta lenta de
 * ontem nunca sobrescreve a de hoje.
 *
 * Depois da primeira carga, a agenda se atualiza em silêncio (aba volta a ficar visível e a cada 60 s):
 * não passa por "carregando" e, se falhar, mantém os dados atuais em vez de mostrar erro.
 *
 * Depois de uma ação no painel (mudar status), a tela usa dois comandos:
 *  - `aplicar(linha)`: troca o agendamento pela linha que o servidor devolveu, na hora, e descarta
 *    qualquer busca que já estava no ar (ela poderia trazer o estado de antes da ação);
 *  - `atualizar()`: busca em silêncio, para pegar também o que outras pessoas mudaram.
 * Criar e remover bloqueio usam `aplicarBloqueios(mudar)`: a lista de bloqueios da tela vira o que
 * `mudar` devolver, na hora (mesma regra: busca que já estava no ar é descartada).
 */
export function useDadosDoPeriodo(
  de: DiaISO,
  ate: DiaISO,
): EstadoPeriodo & ComandosDoPeriodo & { tentarDeNovo: () => void } {
  const [tentativa, setTentativa] = useState(0)
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  // Os comandos vivem dentro do efeito (usam as variáveis da busca atual); este ref os entrega à tela.
  const comandos = useRef<Comandos | null>(null)
  const chave = `${de}|${ate}|${tentativa}`

  useEffect(() => {
    // O período faz parte da chave ("de|ate|tentativa"): ler dela deixa a chave como única dependência do efeito.
    const [dePedido, atePedido] = chave.split('|')
    let ativo = true
    let ultimoPedido = 0
    let ultimoAplicado = 0

    // Busca e guarda. A busca silenciosa (atualização em segundo plano) nunca troca dados por erro:
    // se falhar, fica o que já está na tela. Resposta mais antiga que outra já aplicada é descartada.
    const buscar = (silenciosa: boolean) => {
      const pedido = ++ultimoPedido
      void buscarDadosDoPeriodo(dePedido, atePedido).then((resultado) => {
        if (!ativo || pedido < ultimoAplicado) return
        if (silenciosa && !resultado.ok) return
        ultimoAplicado = pedido
        setGuardado({ chave, resultado })
      })
    }
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') buscar(true)
    }

    // Resposta que já estava a caminho é anterior à ação: marcá-la como "mais antiga que a aplicada" a descarta.
    const aplicar = (agendamento: Agendamento) => {
      ultimoAplicado = ++ultimoPedido
      setGuardado((atual) => {
        if (atual?.chave !== chave || !atual.resultado.ok) return atual
        const dados = atual.resultado.dados
        const agendamentos = dados.agendamentos.map((a) => (a.id === agendamento.id ? agendamento : a))
        return { chave, resultado: { ok: true, dados: { ...dados, agendamentos } } }
      })
    }
    const aplicarBloqueios = (mudar: (atuais: Bloqueio[]) => Bloqueio[]) => {
      ultimoAplicado = ++ultimoPedido
      setGuardado((atual) => {
        if (atual?.chave !== chave || !atual.resultado.ok) return atual
        const dados = atual.resultado.dados
        return { chave, resultado: { ok: true, dados: { ...dados, bloqueios: mudar(dados.bloqueios) } } }
      })
    }
    comandos.current = { atualizar: () => buscar(true), aplicar, aplicarBloqueios }

    buscar(false)
    // Outro atendente pode ter mexido na agenda: atualiza ao voltar para a aba e a cada minuto.
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    const intervalo = window.setInterval(atualizarSeVisivel, ATUALIZAR_A_CADA_MS)
    return () => {
      ativo = false
      comandos.current = null
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
      window.clearInterval(intervalo)
    }
  }, [chave])

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  const atualizar = useCallback(() => comandos.current?.atualizar(), [])
  const aplicar = useCallback((agendamento: Agendamento) => comandos.current?.aplicar(agendamento), [])
  const aplicarBloqueios = useCallback(
    (mudar: (atuais: Bloqueio[]) => Bloqueio[]) => comandos.current?.aplicarBloqueios(mudar),
    [],
  )
  const acoes = { tentarDeNovo, atualizar, aplicar, aplicarBloqueios }

  if (guardado?.chave !== chave) return { status: 'carregando', ...acoes }
  if (!guardado.resultado.ok) return { status: 'erro', ...acoes }
  return { status: 'ok', dados: guardado.resultado.dados, ...acoes }
}
