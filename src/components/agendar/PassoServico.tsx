import OpcaoCheckbox from './OpcaoCheckbox.tsx'
import OpcaoRadio from './OpcaoRadio.tsx'
import PassoLayout from './PassoLayout.tsx'
import { combos, servicosAvulsos } from '../../data/barbearia.ts'
import { MAX_AVULSOS } from '../../lib/agendar/catalogo.ts'
import { formatarDuracao, formatarPreco } from '../../lib/formatar.ts'

interface Props {
  /** Slugs escolhidos: um combo, OU um ou mais avulsos. */
  servicos: string[]
  /** Combo: escolhe (e solta os avulsos). Avulso: liga/desliga (e solta o combo). */
  aoAlternar: (slug: string) => void
}

const legenda = 'font-corpo text-sm tracking-widest text-neon uppercase'
const etiquetaEscolhido =
  'bg-neon px-2 py-0.5 font-display text-sm leading-none tracking-wider text-preto uppercase'

// Passo 1. Combos em destaque (linhas largas com preço neon) e avulsos em lista compacta.
export default function PassoServico({ servicos, aoAlternar }: Props) {
  const avulsosMarcados = servicos.filter((s) => servicosAvulsos.some((a) => a.slug === s)).length
  const limiteAtingido = avulsosMarcados >= MAX_AVULSOS
  // A Menezes não tem combo (lista vazia em barbearia.ts): o bloco de combos só aparece se existir algum.
  const temCombos = combos.length > 0
  return (
    <PassoLayout
      numero={1}
      titulo="O que vai ser?"
      ajuda={
        temCombos
          ? 'Um combo, ou os avulsos que quiser somar. Combo não se mistura com avulso.'
          : 'Marque um serviço ou some vários no mesmo horário.'
      }
    >
      {temCombos && (
      <fieldset>
        <legend className={legenda}>Combos</legend>
        <div className="mt-4 flex flex-col gap-3">
          {combos.map((combo) => {
            const escolhido = servicos.includes(combo.slug)
            return (
              <OpcaoRadio
                key={combo.slug}
                nome="combo"
                valor={combo.slug}
                selecionado={escolhido}
                aoEscolher={aoAlternar}
              >
                <span
                  className={`flex items-center gap-4 border-2 p-4 transition-colors duration-rapida ${
                    escolhido ? 'border-neon bg-concreto' : 'border-cimento bg-asfalto hover:border-chumbo'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`texto-vazado w-12 shrink-0 font-display text-display-sm leading-none ${
                      escolhido ? 'text-neon' : 'text-chumbo'
                    }`}
                  >
                    0{combo.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-display text-3xl leading-none tracking-wide text-branco uppercase">
                        {combo.nome}
                      </span>
                      {escolhido && <span className={etiquetaEscolhido}>Escolhido</span>}
                    </span>
                    <span className="mt-2 block font-corpo text-sm text-cinza-claro">
                      {combo.itens.join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-3xl leading-none text-neon">
                      {formatarPreco(combo.precoCentavos)}
                    </span>
                    <span className="mt-1 block font-corpo text-sm text-chumbo">
                      {formatarDuracao(combo.duracaoMinutos)}
                    </span>
                  </span>
                </span>
              </OpcaoRadio>
            )
          })}
        </div>
      </fieldset>
      )}

      <fieldset className={temCombos ? 'mt-10' : ''}>
        <legend className={legenda}>{temCombos ? 'Avulsos' : 'Serviços'}</legend>
        <p id="ajuda-avulsos" className="mt-2 font-corpo text-sm text-cinza-claro">
          Marque quantos quiser (até {MAX_AVULSOS}). Preço e tempo somam.
        </p>
        {/* Região sempre presente: o leitor de tela anuncia quando o texto aparece. */}
        <p role="status" className="font-corpo text-sm font-semibold text-neon">
          {limiteAtingido ? `Limite de ${MAX_AVULSOS} atingido` : null}
        </p>
        <div className="mt-4 grid border-t border-cimento md:grid-cols-2 md:gap-x-8">
          {servicosAvulsos.map((s) => {
            const escolhido = servicos.includes(s.slug)
            return (
              <OpcaoCheckbox
                key={s.slug}
                valor={s.slug}
                marcado={escolhido}
                aoAlternar={aoAlternar}
                desabilitado={limiteAtingido && !escolhido}
                descritoPor="ajuda-avulsos"
              >
                <span
                  className={`flex min-h-14 items-center justify-between gap-3 border-b border-l-4 border-b-cimento py-2 pr-2 pl-3 transition-colors duration-rapida ${
                    escolhido ? 'border-l-neon bg-concreto' : 'border-l-transparent hover:bg-asfalto'
                  }`}
                >
                  {/* Caixa quadrada: o estado não depende só da cor. */}
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${
                      escolhido ? 'border-neon bg-neon' : 'border-chumbo'
                    }`}
                  >
                    {escolhido && (
                      <svg viewBox="0 0 16 16" className="h-4 w-4 text-preto" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M2.5 8.5 6.5 12.5 13.5 4" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 font-display text-2xl tracking-wide text-branco uppercase">
                    {s.nome}
                  </span>
                  <span className="shrink-0 text-right font-corpo text-sm text-cinza-claro">
                    {/* Numa linha própria: junto do preço, empurrava o nome do serviço e os dois se sobrepunham. */}
                    {s.aPartirDe && <span className="block text-xs text-chumbo">a partir de</span>}
                    {formatarDuracao(s.duracaoMinutos)} ·{' '}
                    <span className="font-semibold text-branco">{formatarPreco(s.precoCentavos)}</span>
                  </span>
                </span>
              </OpcaoCheckbox>
            )
          })}
        </div>
      </fieldset>
    </PassoLayout>
  )
}
