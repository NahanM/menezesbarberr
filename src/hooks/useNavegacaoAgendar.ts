import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

type EstadoNavegacao = { passoAnterior?: number } | null

/**
 * Navegação entre os passos do /agendar. Quem manda no passo é a URL (?passo=2); cada avanço é
 * uma entrada nova no histórico (push), então o voltar do celular volta um passo em vez de sair
 * da página.
 */
export function useNavegacaoAgendar() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // O state grava de qual passo viemos: é como o "Voltar" sabe se a entrada anterior é do fluxo.
  // Com replace a entrada anterior NÃO é o passo `de` (foi trocada), então não se grava nada.
  // `editar`: true liga o modo de edição (?editar=1), false desliga, sem valor mantém como está.
  const irPara = useCallback(
    (n: number, de: number, replace = false, editar?: boolean) => {
      setParams(
        (anterior) => {
          const novo = new URLSearchParams(anterior)
          novo.set('passo', String(n))
          if (editar === true) novo.set('editar', '1')
          else if (editar === false) novo.delete('editar')
          return novo
        },
        { state: replace ? null : { passoAnterior: de }, replace },
      )
    },
    [setParams],
  )

  /** A entrada anterior do histórico é mesmo o passo `anterior`? (Entrada trocada por replace não conta.) */
  const veioDe = (anterior: number) => {
    const estadoNav = location.state as EstadoNavegacao
    return location.key !== 'default' && estadoNav?.passoAnterior === anterior
  }

  // Voltar da tela NÃO empilha histórico. Se a entrada anterior é o passo anterior, anda uma
  // entrada para trás (navigate(-1)). Senão (abriu direto no passo, ou chegou por atalho) troca
  // a entrada atual por ?passo=anterior (replace).
  const voltar = (passo: number) => {
    const anterior = passo - 1
    if (veioDe(anterior)) {
      void navigate(-1)
      return
    }
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        novo.set('passo', String(anterior))
        return novo
      },
      { replace: true },
    )
  }

  // Volta para a revisão (passo 5) depois de editar um item.
  //  - Horário ainda por conferir (serviço ou barbeiro mudou): vai ao passo 3, que confere com a
  //    lista de horários livres e, se o horário continua livre, volta sozinho à revisão.
  //  - Senão: se a entrada anterior é a revisão, volta uma entrada (sem empilhar); se não, vai a ela.
  const irParaRevisao = (passo: number, horaPorConferir: boolean) => {
    if (horaPorConferir) {
      if (passo !== 3) irPara(3, passo) // no passo 3 a conferência já está em andamento
      return
    }
    if (veioDe(5)) {
      void navigate(-1)
      return
    }
    irPara(5, passo, false, false)
  }

  return { params, irPara, voltar, irParaRevisao }
}
