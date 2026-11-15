// Avisos que o dia e a semana compartilham: carregando e erro com "Tentar de novo".

export function CarregandoAgenda() {
  return (
    <div role="status" className="grid min-h-64 content-center gap-4">
      <p className="font-display text-display-sm tracking-wider text-branco uppercase">Carregando a agenda</p>
      <div aria-hidden="true" className="h-px w-24 bg-neon motion-safe:animate-pulse" />
    </div>
  )
}

export function ErroAgenda({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="border-2 border-cimento p-6">
      <p className="font-display text-3xl text-branco uppercase">Não deu para carregar a agenda.</p>
      <p className="mt-2 max-w-prose">Confira a internet e tente de novo.</p>
      <button
        type="button"
        onClick={aoTentarDeNovo}
        className="mt-6 inline-flex min-h-11 items-center justify-center bg-neon px-5 font-display text-xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco"
      >
        Tentar de novo
      </button>
    </div>
  )
}
