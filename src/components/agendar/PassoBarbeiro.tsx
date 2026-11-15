import OpcaoRadio from './OpcaoRadio.tsx'
import PassoLayout from './PassoLayout.tsx'
import Listras from '../grafico/Listras.tsx'
import { barbeiros } from '../../data/barbearia.ts'

interface Props {
  /** null = sem preferência. */
  barbeiro: string | null
  aoEscolher: (slug: string | null) => void
}

// Valor do rádio para "sem preferência" (rádio não aceita null).
const SEM_PREFERENCIA = '__qualquer__'

const etiquetaEscolhido =
  'shrink-0 bg-neon px-2 py-0.5 font-display text-sm leading-none tracking-wider text-preto uppercase'

// Passo 2. "Sem preferência" é o padrão e vem primeiro; os barbeiros vêm em linhas
// com o monograma em contorno (sem foto de pessoa inventada).
export default function PassoBarbeiro({ barbeiro, aoEscolher }: Props) {
  const escolher = (valor: string) => aoEscolher(valor === SEM_PREFERENCIA ? null : valor)
  const semPreferencia = barbeiro === null

  return (
    <PassoLayout
      numero={2}
      titulo="Com quem?"
      ajuda="Sem preferência: o primeiro barbeiro livre atende você."
    >
      <fieldset>
        <legend className="sr-only">Barbeiro</legend>
        <div className="flex flex-col gap-3">
          <OpcaoRadio
            nome="barbeiro"
            valor={SEM_PREFERENCIA}
            selecionado={semPreferencia}
            aoEscolher={escolher}
          >
            <span
              className={`flex items-center gap-4 border-2 p-4 transition-colors duration-rapida ${
                semPreferencia ? 'border-neon bg-concreto' : 'border-cimento bg-asfalto hover:border-chumbo'
              }`}
            >
              <span className="w-16 shrink-0">
                <Listras className={`h-12 w-full ${semPreferencia ? 'text-neon' : 'text-chumbo'}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-3xl leading-none tracking-wide text-branco uppercase">
                  Sem preferência
                </span>
                <span className="mt-2 block font-corpo text-sm text-cinza-claro">
                  Horários de todos os barbeiros. A gente escolhe um livre.
                </span>
              </span>
              {semPreferencia && <span className={etiquetaEscolhido}>Escolhido</span>}
            </span>
          </OpcaoRadio>

          {barbeiros.map((b) => {
            const escolhido = barbeiro === b.slug
            return (
              <OpcaoRadio
                key={b.slug}
                nome="barbeiro"
                valor={b.slug}
                selecionado={escolhido}
                aoEscolher={escolher}
              >
                <span
                  className={`flex items-center gap-4 border-2 p-4 transition-colors duration-rapida ${
                    escolhido ? 'border-neon bg-concreto' : 'border-cimento bg-asfalto hover:border-chumbo'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`texto-vazado w-16 shrink-0 font-display text-display-sm leading-none ${
                      escolhido ? 'text-neon' : 'text-chumbo'
                    }`}
                  >
                    {b.monograma}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-3xl leading-none tracking-wide text-branco uppercase">
                      {b.nome}
                    </span>
                    <span className="mt-2 block font-corpo text-sm text-cinza-claro">
                      {b.especialidade}
                    </span>
                  </span>
                  {escolhido && <span className={etiquetaEscolhido}>Escolhido</span>}
                </span>
              </OpcaoRadio>
            )
          })}
        </div>
      </fieldset>
    </PassoLayout>
  )
}
