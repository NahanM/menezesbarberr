import Logo from '../Logo.tsx'
import BotaoSair from './BotaoSair.tsx'

interface Props {
  email: string
}

// Barra do painel: marca à esquerda, e-mail de quem está logado e Sair à direita.
// No celular o e-mail some atrás de reticências para o Sair nunca sair da tela.
export default function CabecalhoPainel({ email }: Props) {
  return (
    <header className="border-b border-cimento bg-preto">
      <div className="mx-auto flex h-16 items-center gap-3 px-gutter">
        <Logo className="h-10 shrink-0" />
        <span className="hidden font-display text-2xl tracking-wider text-branco uppercase sm:inline">
          Painel
        </span>
        <span className="min-w-0 flex-1 truncate text-right font-corpo text-sm text-cinza-claro" title={email}>
          {email}
        </span>
        <BotaoSair className="shrink-0" />
      </div>
    </header>
  )
}
