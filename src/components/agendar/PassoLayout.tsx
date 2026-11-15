import { use, useEffect, useRef, type ReactNode } from 'react'
import { FocarTituloContext } from './focoContext.ts'
import Listras from '../grafico/Listras.tsx'
import { TOTAL_PASSOS } from '../../lib/agendar/estado.ts'

interface Props {
  numero: number
  titulo: string
  ajuda: string
  children: ReactNode
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

// Moldura de cada passo, no estilo pôster: número grande só com contorno, título em Bebas
// e, no desktop, essa coluna fica fixa à esquerda enquanto as opções rolam à direita.
export default function PassoLayout({ numero, titulo, ajuda, children }: Props) {
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const focar = use(FocarTituloContext)

  // Ao trocar de passo (não na primeira carga), o foco vai para o título: quem usa leitor de
  // tela ouve o novo passo e quem usa teclado recomeça a navegar do topo.
  // preventScroll: a rolagem já é feita pelo RolagemSuave.
  useEffect(() => {
    if (focar) tituloRef.current?.focus({ preventScroll: true })
  }, [focar])

  // Celular, do passo 2 em diante: cabeçalho enxuto (só o título; o número vazado fica atrás, à
  // direita) para a ação do passo aparecer sem rolar. O passo 1 mantém a descrição inteira.
  const compacto = numero > 1

  return (
    <section className="grid gap-8 md:grid-cols-12 md:gap-12">
      <header
        className={`relative md:sticky md:top-28 md:col-span-4 md:self-start ${
          compacto ? 'flex min-h-[7rem] items-center max-md:-mb-2' : ''
        }`}
      >
        <div className="relative z-10 min-w-0">
          <p
            className={`font-corpo text-sm tracking-widest text-chumbo uppercase ${
              compacto ? 'max-md:sr-only' : ''
            }`}
          >
            Passo {doisDigitos(numero)} de {doisDigitos(TOTAL_PASSOS)}
          </p>
          {/* Desktop: número vazado grande acima do título. */}
          <p
            aria-hidden="true"
            className="texto-vazado mt-1 hidden font-display text-display-lg leading-none text-neon md:block"
          >
            {doisDigitos(numero)}
          </p>
          <h1 ref={tituloRef} tabIndex={-1} className="md:mt-2 text-display-md outline-none">
            {titulo}
          </h1>
          <p
            className={`mt-3 max-w-xs font-corpo text-lg text-cinza-claro ${
              compacto ? 'max-md:sr-only' : 'max-md:max-w-[62%]'
            }`}
          >
            {ajuda}
          </p>
          <Listras className="mt-6 hidden h-3 w-28 text-neon md:block" />
        </div>
        {/* Celular: número vazado atrás do título, à direita (~1/3 da largura), sem ocupar altura. */}
        <p
          aria-hidden="true"
          className={`texto-vazado pointer-events-none absolute right-0 font-display text-[38vw] leading-none text-neon select-none md:hidden ${
            compacto ? 'top-1/2 -translate-y-1/2' : 'top-0'
          }`}
        >
          {doisDigitos(numero)}
        </p>
      </header>
      <div className="min-w-0 md:col-span-8">{children}</div>
    </section>
  )
}
