import { useEffect } from 'react'
import { useSessao } from '../hooks/useSessao.ts'
import { useEquipe } from '../hooks/useEquipe.ts'
import AgendaPainel from '../components/painel/AgendaPainel.tsx'
import CabecalhoPainel from '../components/painel/CabecalhoPainel.tsx'
import TelaCarregando from '../components/painel/TelaCarregando.tsx'
import TelaLogin from '../components/painel/TelaLogin.tsx'
import TelaSemAcesso from '../components/painel/TelaSemAcesso.tsx'

// Logado: confere se é da equipe antes de mostrar qualquer coisa do painel.
function AreaEquipe({ userId, email }: { userId: string; email: string }) {
  const equipe = useEquipe(userId)

  if (equipe.status === 'carregando') return <TelaCarregando />
  if (equipe.status === 'sem-acesso') return <TelaSemAcesso />
  if (equipe.status === 'erro') return <TelaSemAcesso falhou aoTentarDeNovo={equipe.tentarDeNovo} />

  return (
    <>
      <CabecalhoPainel email={email} />
      <main id="conteudo" className="px-gutter py-8">
        <AgendaPainel />
      </main>
    </>
  )
}

// /painel: sessão carregando → nada de formulário; sem sessão → login; com sessão → checa a equipe.
export default function Painel() {
  const sessao = useSessao()

  // Painel não deve aparecer em buscadores: meta robots só enquanto esta rota está montada.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  if (sessao.status === 'carregando') return <TelaCarregando />
  if (sessao.status === 'sem-sessao') return <TelaLogin />
  return <AreaEquipe userId={sessao.sessao.user.id} email={sessao.sessao.user.email ?? ''} />
}
