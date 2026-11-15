import { useEffect, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'

// Casca dos diálogos de bloqueio, no mesmo padrão do DetalhesAgendamento: <dialog> nativo aberto com
// showModal() (o navegador deixa o resto da página inerte e fecha com Esc). Celular: folha que sobe da
// base da tela. Desktop (md): painel na lateral direita.

interface Props {
  /** O dono do diálogo guarda a ref para poder chamar close() (botão de salvar, por exemplo). */
  dialogoRef: RefObject<HTMLDialogElement | null>
  /** Linha pequena acima do título. */
  sobretitulo: string
  titulo: string
  idTitulo: string
  tituloRef?: RefObject<HTMLHeadingElement | null>
  /** Quem recebe o foco ao abrir. Sem isto vale o primeiro foco do navegador (o botão Fechar). */
  focoInicial?: RefObject<HTMLElement | null>
  /** Enquanto há um salvamento em andamento: Esc, fundo e Fechar não fecham (o resultado ainda vai chegar). */
  ocupado: boolean
  /** O diálogo já fechou (botão, Esc ou clique fora). Quem chama devolve o foco. */
  aoFechar: () => void
  children: ReactNode
}

/** Linha "rótulo: valor" dos detalhes. */
export function LinhaDetalhe({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-b border-cimento py-3">
      <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">{nome}</dt>
      <dd className="font-corpo text-base break-words text-branco">{children}</dd>
    </div>
  )
}

export default function DialogoPainel({
  dialogoRef,
  sobretitulo,
  titulo,
  idTitulo,
  tituloRef,
  focoInicial,
  ocupado,
  aoFechar,
  children,
}: Props) {
  // Abre como modal. Sem cleanup que feche: tirar o <dialog> da árvore já o tira da camada de topo.
  useEffect(() => {
    const d = dialogoRef.current
    if (d && !d.open) d.showModal()
    focoInicial?.current?.focus()
  }, [dialogoRef, focoInicial])

  // A página atrás do diálogo não rola. Compensa a barra de rolagem que some, para o layout não pular.
  useEffect(() => {
    const { body } = document
    const antes = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const barra = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (barra > 0) body.style.paddingRight = `${barra}px`
    return () => {
      body.style.overflow = antes.overflow
      body.style.paddingRight = antes.paddingRight
    }
  }, [])

  // Clique no fundo escuro: o alvo é o próprio <dialog> (o conteúdo ocupa tudo o que não é fundo).
  function aoClicarNoFundo(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget && !ocupado) e.currentTarget.close()
  }

  // O <dialog> modal sozinho deixa o Tab sair para a barra do navegador. Aqui ele dá a volta:
  // do último foco vai ao primeiro, e Shift+Tab do primeiro vai ao último (foco preso).
  function prenderFoco(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return
    const focaveis = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([aria-disabled="true"]), a[href], input:not(:disabled), select:not(:disabled)',
      ),
    ]
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (!primeiro) return
    const ativo = document.activeElement
    if (e.shiftKey && (ativo === primeiro || !e.currentTarget.contains(ativo) || ativo === tituloRef?.current)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && (ativo === ultimo || !e.currentTarget.contains(ativo))) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  return (
    <dialog
      ref={dialogoRef}
      aria-labelledby={idTitulo}
      onClose={aoFechar}
      onCancel={(e) => {
        if (ocupado) e.preventDefault()
      }}
      onClick={aoClicarNoFundo}
      onKeyDown={prenderFoco}
      className="painel-folha fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90svh] w-full max-w-none overflow-y-auto scroll-pb-24 overscroll-contain border-t border-cimento bg-asfalto text-cinza-claro backdrop:bg-preto/80 md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:border-t-0 md:border-l"
    >
      <div className="md:min-h-full">
        <div aria-hidden="true" className="listras h-3 text-cimento" />
        <div className="px-gutter pt-5 pb-8 md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-corpo text-sm tracking-widest text-chumbo uppercase">{sobretitulo}</p>
              <h2
                id={idTitulo}
                ref={tituloRef}
                tabIndex={-1}
                className="mt-1 text-display-sm break-words outline-offset-4"
              >
                {titulo}
              </h2>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => dialogoRef.current?.close()}
              className="inline-flex min-h-11 shrink-0 items-center border border-chumbo px-4 font-corpo text-sm font-semibold tracking-widest text-branco uppercase transition-colors duration-rapida ease-urbz hover:border-branco disabled:cursor-wait disabled:opacity-50"
            >
              Fechar
            </button>
          </div>
          {children}
        </div>
      </div>
    </dialog>
  )
}
