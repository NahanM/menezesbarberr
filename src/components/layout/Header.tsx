import { Link } from 'react-router'
import Logo from '../Logo.tsx'

const classeAncora =
  'hidden font-corpo text-sm tracking-widest text-cinza-claro uppercase transition-colors duration-rapida hover:text-branco sm:inline'

// Cabeçalho enxuto: logo, duas âncoras (só a partir de sm) e o botão Agendar.
// Fixo no topo com fundo sólido (sem vidro/blur). Altura h-16: as seções usam scroll-mt-16.
export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-cimento bg-preto">
      <div className="mx-auto flex h-full items-center justify-between px-gutter">
        <Link to="/" aria-label="Menezes Barber’s, início" className="block">
          <Logo className="h-10" />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-6">
          <Link to="/#servicos" className={classeAncora}>
            Serviços
          </Link>
          <Link to="/#local" className={classeAncora}>
            Onde estamos
          </Link>
          <Link to="/agendar" className="botao botao--principal botao--compacto">
            Agendar
          </Link>
        </nav>
      </div>
    </header>
  )
}
