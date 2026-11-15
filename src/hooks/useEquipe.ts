import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'

export type EstadoEquipe =
  | { status: 'carregando' }
  | { status: 'equipe' }
  | { status: 'sem-acesso' }
  | { status: 'erro' }

interface Guardado {
  chave: string
  resultado: 'equipe' | 'sem-acesso' | 'erro'
}

/**
 * Pergunta ao banco se quem está logado é da equipe (função is_equipe, que lê a tabela `equipe`).
 * Estar logado não basta: o painel só abre para quem está nela. Erro de rede é `erro`
 * (tentar de novo), diferente de `sem-acesso` (o banco respondeu que não é da equipe).
 *
 * O status é derivado: resposta guardada de outro usuário (ou de outra tentativa) conta como carregando.
 */
export function useEquipe(userId: string): EstadoEquipe & { tentarDeNovo: () => void } {
  const [tentativa, setTentativa] = useState(0)
  const [guardado, setGuardado] = useState<Guardado | null>(null)
  const chave = `${userId}:${tentativa}`

  useEffect(() => {
    let vivo = true
    const guardar = (resultado: Guardado['resultado']) => {
      if (vivo) setGuardado({ chave, resultado })
    }
    // Segundo argumento do then: falha que não vira `error` (rede caída, exceção) também vira estado de erro.
    void supabase.rpc('is_equipe').then(
      ({ data, error }) => guardar(error ? 'erro' : data === true ? 'equipe' : 'sem-acesso'),
      () => guardar('erro'),
    )
    return () => {
      vivo = false
    }
  }, [chave])

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  const estado: EstadoEquipe =
    guardado?.chave === chave ? { status: guardado.resultado } : { status: 'carregando' }
  return { ...estado, tentarDeNovo }
}
