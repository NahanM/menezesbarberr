import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Quando muda (ex.: o caminho da URL), o erro anterior é esquecido e a página nova tenta carregar. */
  chaveDeReinicio: string
}

interface Estado {
  falhou: boolean
}

// Rede de segurança das rotas carregadas sob demanda (React.lazy). Se a internet cai justo quando a
// pessoa abre /agendar, o arquivo da página não chega e, sem isto, a tela ficaria em branco.
// Precisa ser classe: o React só captura erro de renderização em componentes de classe.
export default class ErroDeRota extends Component<Props, Estado> {
  state: Estado = { falhou: false }

  static getDerivedStateFromError(): Estado {
    return { falhou: true }
  }

  componentDidUpdate(anterior: Props) {
    if (this.state.falhou && anterior.chaveDeReinicio !== this.props.chaveDeReinicio) {
      this.setState({ falhou: false })
    }
  }

  render() {
    if (!this.state.falhou) return this.props.children
    return (
      <main id="conteudo" className="grid min-h-dvh place-items-center px-gutter">
        <div role="alert" className="max-w-md border-2 border-neon bg-asfalto p-6">
          <h1 className="text-display-sm">Não abriu.</h1>
          <p className="mt-3 font-corpo text-lg text-branco">
            Algo deu errado ao abrir esta página. Tente de novo.
          </p>
          {/* Recarrega: o React guarda a falha de um import que deu errado, então só uma página nova resolve. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 mr-8 inline-flex min-h-11 items-center border-b border-neon font-display text-2xl tracking-wider text-branco uppercase transition-colors duration-rapida hover:text-neon"
          >
            Tentar de novo
          </button>
          {/* Link comum (recarrega a página), não o do router: o React.lazy guarda a falha do import, então só uma página nova faz o /agendar tentar baixar de novo. */}
          <a
            href="/"
            className="mt-3 inline-flex min-h-11 items-center font-corpo text-sm tracking-widest text-cinza-claro uppercase underline decoration-neon underline-offset-4 hover:text-branco"
          >
            Voltar ao início
          </a>
        </div>
      </main>
    )
  }
}
