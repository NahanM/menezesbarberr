import type { ReactNode } from 'react'

interface Props {
  /** Texto à esquerda: o que o cliente já escolheu. */
  resumo: ReactNode
  /** Linha pequena abaixo do resumo (duração, barbeiro, horário). */
  detalhe?: ReactNode
  /** Preço já formatado; aparece em neon. */
  preco?: string
  rotulo: string
  desabilitado: boolean
  aoContinuar?: () => void
  /** Se informado, o botão envia esse <form> (Enter nos campos também envia). */
  formId?: string
}

// Barra fixa no rodapé da tela: resumo do que foi escolhido e o botão de seguir.
// Fica no alcance do polegar no celular. Fundo sólido, sem vidro.
export default function BarraAcao({
  resumo,
  detalhe,
  preco,
  rotulo,
  desabilitado,
  aoContinuar,
  formId,
}: Props) {
  return (
    <div data-testid="barra-acao" className="fixed inset-x-0 bottom-0 z-40 border-t border-cimento bg-preto">
      {/* pb extra: respeita a barra de gestos do iPhone (safe area). */}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-gutter pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl leading-none tracking-wider text-branco uppercase">
            {resumo}
          </p>
          {(detalhe !== undefined || preco !== undefined) && (
            <p className="mt-1 line-clamp-2 font-corpo text-sm text-cinza-claro">
              {/* No celular não sobra largura para o preço grande ao lado: ele entra aqui, em neon. */}
              {preco !== undefined && (
                <span className="font-semibold text-neon sm:hidden">{preco} · </span>
              )}
              {detalhe}
            </p>
          )}
        </div>
        {preco !== undefined && (
          <p className="hidden shrink-0 font-display text-3xl leading-none text-neon sm:block">
            {preco}
          </p>
        )}
        <button
          type={formId === undefined ? 'button' : 'submit'}
          form={formId}
          disabled={desabilitado}
          onClick={aoContinuar}
          className="inline-flex min-h-12 shrink-0 items-center justify-center bg-neon px-5 font-display text-xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz enabled:hover:bg-branco disabled:cursor-not-allowed disabled:bg-concreto disabled:text-chumbo"
        >
          {rotulo}
        </button>
      </div>
    </div>
  )
}
