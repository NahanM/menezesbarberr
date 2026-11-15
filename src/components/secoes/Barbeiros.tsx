import { Link } from 'react-router'
import PalavraVazada from '../grafico/PalavraVazada.tsx'
import Seta from '../grafico/Seta.tsx'
import { barbeiros } from '../../data/barbearia.ts'

// Ao passar o mouse (ou focar o link) a linha "acende": um bloco amarelo sobe por trás (scaleY, só
// transform) e os textos viram escuros. Sem hover (celular) a linha fica como está.
const inverte = 'transition-colors duration-rapida group-hover:text-preto group-focus-within:text-preto'

// Barbeiros em linhas largas, uma por barbeiro, em vez de cards. Sem foto de pessoa inventada:
// o rosto da linha é o monograma grande em contorno. Os nomes vêm da aba Profissionais do AppBarber.
// No desktop o monograma alterna de lado (esquerda, direita, esquerda) para quebrar a repetição.
export default function Barbeiros() {
  return (
    <section id="barbeiros" className="scroll-mt-16 overflow-x-clip bg-preto pt-16 md:pt-secao">
      <header className="px-gutter pb-10 md:pb-14">
        <h2 className="text-display-md">Escolha quem corta</h2>
      </header>

      <ul className="border-t border-cimento">
        {barbeiros.map((barbeiro, i) => {
          const invertida = i % 2 === 1
          return (
            <li key={barbeiro.slug} className="group relative isolate overflow-hidden border-b border-cimento">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 origin-bottom scale-y-0 bg-neon transition-transform duration-media ease-urbz group-hover:scale-y-100 group-focus-within:scale-y-100"
              />
              <div
                className={`flex flex-col gap-3 px-gutter py-6 md:items-center md:gap-12 md:py-4 ${
                  invertida ? 'md:flex-row-reverse' : 'md:flex-row'
                }`}
              >
                <PalavraVazada
                  texto={barbeiro.monograma}
                  className={`text-display-lg text-neon md:w-[18%] md:text-display-md ${
                    invertida ? 'md:text-right' : ''
                  } ${inverte}`}
                />
                <h3 className={`flex-1 text-display-sm text-branco ${invertida ? 'md:text-right' : ''} ${inverte}`}>
                  {barbeiro.nome}
                </h3>
                <Link
                  to={`/agendar?barbeiro=${barbeiro.slug}`}
                  className={`inline-flex min-h-11 items-center gap-4 font-corpo font-semibold text-branco ${inverte}`}
                >
                  Agendar com {barbeiro.nome}
                  <Seta className="h-3 w-12 text-current transition-transform duration-rapida group-hover:translate-x-1" />
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
