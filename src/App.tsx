import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import Landing from './pages/Landing.tsx'
import NaoEncontrada from './pages/NaoEncontrada.tsx'
import ErroDeRota from './components/ErroDeRota.tsx'
import RolagemSuave from './components/RolagemSuave.tsx'
import PularParaConteudo from './components/PularParaConteudo.tsx'

// Agendar e Painel carregam sob demanda (React.lazy): quem só abre a landing
// não baixa o código deles nem o do Supabase.
const Agendar = lazy(() => import('./pages/Agendar.tsx'))
const AgendarSucesso = lazy(() => import('./pages/AgendarSucesso.tsx'))
const Painel = lazy(() => import('./pages/Painel.tsx'))

function Carregando() {
  return (
    <div
      role="status"
      className="grid min-h-dvh place-items-center font-display text-display-sm text-neon uppercase"
    >
      Carregando
    </div>
  )
}

export default function App() {
  // O painel é tela de trabalho: rolagem nativa, sem Lenis. Sair de /painel monta o Lenis de novo.
  const { pathname } = useLocation()
  const noPainel = pathname.startsWith('/painel')
  return (
    <>
      <PularParaConteudo />
      {!noPainel && <RolagemSuave />}
      <ErroDeRota chaveDeReinicio={pathname}>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/agendar" element={<Agendar />} />
            <Route path="/agendar/sucesso" element={<AgendarSucesso />} />
            <Route path="/painel" element={<Painel />} />
            <Route path="*" element={<NaoEncontrada />} />
          </Routes>
        </Suspense>
      </ErroDeRota>
    </>
  )
}
