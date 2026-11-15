import { useSearchParams } from 'react-router'
import { lerCancelados, PARAM_CANCELADOS } from '../lib/painel/cancelados.ts'

// Estado atual do filtro dos cancelados (?cancelados=1). Quem monta um link do painel usa isto para
// levar o filtro junto; a fonte da verdade continua sendo a URL.
export function useCancelados(): boolean {
  const [params] = useSearchParams()
  return lerCancelados(params.get(PARAM_CANCELADOS))
}
