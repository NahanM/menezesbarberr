import { useState } from 'react'
import { supabase } from '../../lib/supabase.ts'

interface Props {
  className?: string
}

// Encerra a sessão. A volta ao formulário vem do onAuthStateChange (useSessao), não daqui.
export default function BotaoSair({ className = '' }: Props) {
  const [saindo, setSaindo] = useState(false)

  const sair = async () => {
    setSaindo(true)
    try {
      await supabase.auth.signOut()
    } finally {
      // Se a tela segue montada (ex.: falha de rede), libera o botão para tentar de novo.
      setSaindo(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void sair()}
      disabled={saindo}
      className={`inline-flex min-h-11 items-center justify-center border-2 border-cimento px-4 font-display text-lg tracking-wider text-branco uppercase transition-colors duration-rapida ease-urbz hover:border-neon hover:text-neon disabled:cursor-wait disabled:text-chumbo ${className}`}
    >
      {saindo ? 'Saindo' : 'Sair'}
    </button>
  )
}
