import { useEffect, useState } from 'react'
import { buscarHorarios, type Resultado } from '../lib/agendar/api.ts'
import type { DiaISO } from '../lib/agendar/datas.ts'
import type { ErroAgendar } from '../lib/agendar/erros.ts'

export type EstadoHorarios =
  | { status: 'carregando' }
  | { status: 'ok'; horarios: string[] }
  | { status: 'erro'; erro: ErroAgendar }

interface Guardado {
  /** Identifica para qual pedido é esta resposta. */
  chave: string
  resultado: Resultado<string[]>
}

/**
 * Busca os horários livres sempre que os serviços, o dia ou o barbeiro mudam.
 *
 * Em vez de um "carregando = true" gravado à mão, o status é DERIVADO: se a resposta
 * guardada não é do pedido atual, ainda estamos carregando. Isso evita mostrar horários
 * do dia anterior por um instante e dispensa setState dentro do efeito.
 */
export function useHorarios(
  servicos: string[],
  dia: DiaISO | null,
  barbeiro: string | null,
): EstadoHorarios & { tentarDeNovo: () => void } {
  const [tentativa, setTentativa] = useState(0)
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  // A lista vira texto para servir de chave: um array novo a cada render não pode disparar a busca.
  const servicosChave = servicos.join(',')
  const chave = `${servicosChave}|${dia}|${barbeiro}|${tentativa}`

  useEffect(() => {
    if (servicosChave === '' || dia === null) return
    // Se o cliente trocar de dia antes da resposta chegar, ignoramos a resposta velha.
    let cancelado = false
    void buscarHorarios(servicosChave.split(','), dia, barbeiro).then((resultado) => {
      if (!cancelado) setGuardado({ chave, resultado })
    })
    return () => {
      cancelado = true
    }
  }, [servicosChave, dia, barbeiro, chave])

  const tentarDeNovo = () => setTentativa((n) => n + 1)

  // Sem dia (nenhum dia aberto na janela) não há o que buscar: lista vazia, e não "carregando" para sempre.
  if (dia === null || servicosChave === '') return { status: 'ok', horarios: [], tentarDeNovo }

  if (guardado === null || guardado.chave !== chave) return { status: 'carregando', tentarDeNovo }
  if (!guardado.resultado.ok) {
    return { status: 'erro', erro: guardado.resultado.erro, tentarDeNovo }
  }
  return { status: 'ok', horarios: guardado.resultado.dados, tentarDeNovo }
}
