import { Link } from 'react-router'
import Seta from '../grafico/Seta.tsx'
import { servicosAvulsos } from '../../data/barbearia.ts'
import { formatarDuracao, formatarPreco } from '../../lib/formatar.ts'

// Serviços como tabela de preços de barbearia: nome, linha pontilhada, preço. Sem cards.
// Composição assimétrica: título e explicação numa coluna estreita, lista na larga.
// Cada linha leva ao /agendar já com o serviço marcado (?servico=slug).
export default function Servicos() {
  return (
    <section id="servicos" className="relative scroll-mt-16 overflow-x-clip bg-preto py-16 md:py-secao">
      <div className="grid gap-10 px-gutter md:grid-cols-12 md:gap-12">
        <div className="md:col-span-4">
          <h2 className="text-display-md">Serviços</h2>
          <p className="mt-6 max-w-xs font-corpo text-lg text-cinza-claro">
            Marque um serviço ou some vários no mesmo horário. Preço e tempo somam.
          </p>
          <Link to="/agendar" className="botao botao--principal mt-8">
            Agendar horário
          </Link>
        </div>

        <ul className="md:col-span-8">
          {servicosAvulsos.map((servico) => (
            <li key={servico.slug} className="group border-b border-cimento first:border-t">
              <div className="flex items-end gap-3 pt-5">
                <h3 className="min-w-0 font-display text-display-sm leading-none text-branco">{servico.nome}</h3>
                {/* O pontilhado é o que encolhe: o nome quebra natural e o preço nunca quebra */}
                <span aria-hidden="true" className="mb-1 min-w-2 flex-1 border-b border-dotted border-cimento" />
                <span className="shrink-0 text-right whitespace-nowrap">
                  {servico.aPartirDe && (
                    <span className="mr-2 font-corpo text-sm text-chumbo">a partir de</span>
                  )}
                  <span className="font-display text-display-sm leading-none text-dourado">
                    <span className="sr-only">Preço </span>
                    {formatarPreco(servico.precoCentavos)}
                  </span>
                </span>
              </div>
              <p className="mt-2 max-w-xl font-corpo text-cinza-claro">{servico.descricao}</p>
              <div className="flex items-center justify-between pb-2">
                <p className="font-corpo text-sm text-chumbo">{formatarDuracao(servico.duracaoMinutos)}</p>
                <Link
                  to={`/agendar?servico=${servico.slug}`}
                  aria-label={`Agendar ${servico.nome}`}
                  className="inline-flex min-h-11 items-center gap-3 font-corpo text-sm font-semibold text-branco transition-colors duration-rapida hover:text-neon"
                >
                  Agendar
                  <Seta className="h-3 w-10 text-neon transition-transform duration-rapida group-hover:translate-x-1" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
