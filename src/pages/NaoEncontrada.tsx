import { Link } from 'react-router'

export default function NaoEncontrada() {
  return (
    <main id="conteudo" className="min-h-dvh px-gutter py-secao">
      <p className="font-corpo text-sm tracking-widest text-neon uppercase">Erro 404</p>
      <h1 className="text-display-md">Página não encontrada</h1>
      <Link to="/" className="mt-8 inline-block border-b border-neon text-branco">
        Voltar ao início
      </Link>
    </main>
  )
}
