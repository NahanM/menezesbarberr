import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

/** `carregando` = ainda lendo a sessão guardada no navegador (nada de formulário piscando). */
export type EstadoSessao =
  | { status: 'carregando' }
  | { status: 'sem-sessao' }
  | { status: 'com-sessao'; sessao: Session }

/**
 * Observa a sessão do Supabase Auth.
 * getSession lê a sessão guardada (e a renova se precisar); onAuthStateChange avisa de
 * login, saída e renovação de token. Dentro do callback só guardamos o valor: chamar o
 * Supabase ali dentro pode travar o cliente.
 */
export function useSessao(): EstadoSessao {
  // undefined = ainda não sabemos; null = sabemos que não há sessão.
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let vivo = true
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => {
      if (vivo) setSessao(nova)
    })
    void supabase.auth.getSession().then(({ data: d }) => {
      if (vivo) setSessao((atual) => (atual === undefined ? d.session : atual))
    })
    return () => {
      vivo = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (sessao === undefined) return { status: 'carregando' }
  if (sessao === null) return { status: 'sem-sessao' }
  return { status: 'com-sessao', sessao }
}
