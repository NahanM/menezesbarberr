import BotaoSair from './BotaoSair.tsx'

interface Props {
  /** Falha ao checar (rede, servidor): oferece tentar de novo em vez de dizer que não há acesso. */
  falhou?: boolean
  aoTentarDeNovo?: () => void
}

// Logado, mas fora da tabela `equipe` (ou a checagem falhou). Sempre com saída.
export default function TelaSemAcesso({ falhou = false, aoTentarDeNovo }: Props) {
  return (
    <main id="conteudo" className="grid min-h-dvh content-center bg-preto px-gutter py-secao">
      <p className="font-corpo text-sm tracking-widest text-neon uppercase">Painel</p>
      <h1 className="mt-2 text-display-md">
        {falhou ? 'Não deu para conferir seu acesso.' : 'Sem acesso a este painel.'}
      </h1>
      <p className="mt-4 max-w-prose">
        {falhou
          ? 'Confira a internet e tente de novo.'
          : 'Esta conta não faz parte da equipe da Menezes. Entre com outra conta.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {falhou && aoTentarDeNovo && (
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="inline-flex min-h-11 items-center justify-center bg-neon px-5 font-display text-xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco"
          >
            Tentar de novo
          </button>
        )}
        <BotaoSair />
      </div>
    </main>
  )
}
