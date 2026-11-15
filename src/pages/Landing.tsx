import Header from '../components/layout/Header.tsx'
import Rodape from '../components/layout/Rodape.tsx'
import Hero from '../components/secoes/Hero.tsx'
import Servicos from '../components/secoes/Servicos.tsx'
import Espaco from '../components/secoes/Espaco.tsx'
import Barbeiros from '../components/secoes/Barbeiros.tsx'
import Local from '../components/secoes/Local.tsx'
import Cta from '../components/secoes/Cta.tsx'

// Landing: só monta as seções na ordem. O conteúdo de cada uma vive em components/secoes.
// Não importa nada do Supabase: a página inicial precisa abrir leve.
export default function Landing() {
  return (
    <>
      <Header />
      <main id="conteudo">
        <Hero />
        <Servicos />
        <Espaco />
        <Barbeiros />
        <Local />
        <Cta />
      </main>
      <Rodape />
    </>
  )
}
