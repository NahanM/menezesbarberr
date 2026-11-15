import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import FotoDiagonal from '../grafico/FotoDiagonal.tsx'
import Listras from '../grafico/Listras.tsx'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.ts'
import { formatarDDMM, formatarDiaSemana, formatarHHMM } from '../../lib/agendar/datas.ts'
import { linkConfirmacao } from '../../lib/agendar/mensagem.ts'

interface Props {
  codigo: string
  /** Nome do serviço e do barbeiro como o SERVIDOR devolveu (vale o barbeiro que ele escolheu). */
  servico: string
  barbeiro: string
  /** timestamptz em texto ISO. */
  inicio: string
  nome: string
  /** Sem preço (serviço fora do catálogo), a linha "Valor" não aparece. */
  preco?: string
  /** Duração somada já formatada; sem ela a linha "Duração" não aparece. */
  duracao?: string
}

// Tela de sucesso. O reservado ainda está PENDENTE: só vale depois da confirmação da barbearia
// (por isso o botão do WhatsApp é o destaque). O código aparece como um carimbo: entra
// de maior para o tamanho final (só transform). Com reduced-motion aparece parado.
export default function Sucesso({ codigo, servico, barbeiro, inicio, nome, preco, duracao }: Props) {
  const reduzir = usePrefersReducedMotion()
  const titulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    titulo.current?.focus({ preventScroll: true })
  }, [])

  const quando = `${formatarDiaSemana(inicio)} ${formatarDDMM(inicio)} às ${formatarHHMM(inicio)}`
  const link = linkConfirmacao({ servico, barbeiro, inicio, nome, codigo })

  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-6xl overflow-x-clip px-gutter pt-24 pb-16 md:pt-32">
      <section className="grid gap-10 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-7">
          <p className="font-corpo text-sm tracking-widest text-neon uppercase">Quase lá</p>
          <h1
            ref={titulo}
            tabIndex={-1}
            className="mt-3 text-display-lg outline-none md:text-display-md"
          >
            Horário reservado.
            <br />
            Falta confirmar.
          </h1>
          <p className="mt-6 max-w-md font-corpo text-lg text-cinza-claro">
            Seu horário fica pendente até a barbearia confirmar. Toque no botão e mande a mensagem
            pelo WhatsApp.
          </p>

          <div className="mt-8 flex flex-col items-start gap-5">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-16 w-full items-center justify-center bg-neon px-6 text-center font-display text-3xl md:w-auto md:px-10 md:text-4xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco"
            >
              Confirmar no WhatsApp
            </a>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center font-corpo text-sm tracking-widest text-cinza-claro uppercase underline decoration-neon underline-offset-4 hover:text-branco"
            >
              Voltar ao início
            </Link>
          </div>

          <Listras className="mt-12 h-3 w-28 text-neon md:mt-16" />
          <p className="mt-4 max-w-md font-display text-display-sm leading-none text-branco uppercase">
            Uma nova experiência para uma antiga tradição.
          </p>
        </div>

        <div className="md:col-span-5">
          {/* A foto vem primeiro e o código entra logo abaixo, sem encostar nela: nada cobre o rosto. */}
          <div>
            <FotoDiagonal
              nome="salao"
              sizes="(min-width: 768px) 42vw, 100vw"
              alt="Interior da barbearia, com espelhos em arco e luz dourada"
              foco={{ celular: '55% 50%', desktop: '55% 50%' }}
              imediata
              className="aspect-[16/10] md:aspect-[4/5]"
            />
            <div className="mt-5 w-fit">
              <p className="font-corpo text-sm tracking-widest text-chumbo uppercase">Seu código</p>
              <motion.p
                data-testid="codigo"
                initial={reduzir ? false : { scale: 1.7, rotate: -8 }}
                animate={{ scale: 1, rotate: reduzir ? 0 : -3 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 22,
                  delay: reduzir ? 0 : 0.2,
                }}
                className="mt-2 inline-block origin-left border-4 border-neon px-4 py-2 font-display text-display-md leading-none tracking-widest text-neon"
              >
                {codigo}
              </motion.p>
            </div>
          </div>

          <dl className="mt-10 border-t border-cimento">
            {[
              ['Serviço', servico],
              ['Barbeiro', barbeiro],
              ['Quando', quando],
              ...(duracao === undefined ? [] : [['Duração', duracao]]),
              ['Nome', nome],
            ].map(([rotulo, valor]) => (
              <div
                key={rotulo}
                className="flex items-baseline justify-between gap-4 border-b border-cimento py-3"
              >
                <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">
                  {rotulo}
                </dt>
                <dd className="text-right font-display text-2xl tracking-wide break-words text-branco uppercase">
                  {valor}
                </dd>
              </div>
            ))}
            {preco !== undefined && (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">Valor</dt>
                <dd className="font-display text-4xl leading-none text-neon">{preco}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>
    </main>
  )
}
