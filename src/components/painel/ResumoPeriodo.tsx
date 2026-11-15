import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCancelados } from '../../hooks/useCancelados.ts'
import type { DiaISO } from '../../lib/agendar/datas.ts'
import { montarBuscaPainel } from '../../lib/painel/busca.ts'
import Seta from '../grafico/Seta.tsx'

export interface NumerosDoResumo {
  /** Agendados: tudo menos cancelado e não compareceu (concluído conta). */
  agendados: number
  pendentes: number
  confirmados: number
}

/** O que acontece ao tocar em "pendentes": abrir o primeiro (Dia) ou ir ao dia dele (Semana). */
export type AtalhoPendentes =
  | { tipo: 'botao'; aoClicar: (botao: HTMLButtonElement) => void }
  | { tipo: 'link'; dia: DiaISO }

interface Props {
  /** Nome da região para leitor de tela: "Resumo do dia" ou "Resumo da semana". */
  rotulo: string
  /** null = ainda carregando: mostra traços (nunca um número falso) e some para leitor de tela. */
  numeros: NumerosDoResumo | null
  /** Sem atalho (ou sem pendentes), "pendentes" é só um número. */
  atalho?: AtalhoPendentes
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)

const classeNumero = 'font-display text-4xl leading-none md:text-5xl'
const classeRotulo = 'font-corpo text-xs leading-tight text-cinza-claro md:text-sm'
const classeItem = 'flex min-w-0 flex-col gap-1 px-3 py-3 first:pl-0 md:flex-row md:items-baseline md:gap-3 md:px-6 md:py-2 md:first:pl-0'

// Resumo no topo do Dia e da Semana. Estilo pôster: números grandes na fonte display, divididos por linhas finas,
// sem cartão nem ícone. Celular: uma linha com três colunas compactas (número sobre o rótulo). Desktop: uma linha só, número ao lado do rótulo, 56 a 80 px de altura. O neon fica só no "pendentes" quando
// há algum, porque é o único número que pede ação. Não há aria-live: o número muda depois de uma ação
// (o diálogo já avisa o resultado) e anunciar de novo seria barulho; quem navega lê o resumo ao passar por ele.
export default function ResumoPeriodo({ rotulo, numeros, atalho }: Props) {
  const carregando = numeros === null
  const cancelados = useCancelados() // vai junto no link de pendentes, para o filtro não se perder

  const item = (n: number | null, rotuloItem: string, destaque = false, extra?: ReactNode) => (
    <>
      <span className={`${classeNumero} ${destaque ? 'text-neon' : 'text-branco'}`}>{n ?? '–'}</span>
      {/* Espaço entre número e rótulo: no flex ele não aparece, mas o texto lido fica "3 agendados". */}
      {' '}
      <span className={`${classeRotulo} ${destaque ? 'font-semibold text-branco' : ''}`}>
        {rotuloItem}
      </span>
      {extra}
    </>
  )

  const pendentes = numeros?.pendentes ?? null
  const rotuloPendentes = plural(pendentes ?? 0, 'pendente', 'pendentes')
  const temPendentes = pendentes !== null && pendentes > 0
  const conteudoPendentes = item(
    pendentes,
    rotuloPendentes,
    temPendentes,
    // Seta só onde há atalho e espaço (desktop); o celular fica na linha compacta.
    temPendentes && atalho ? <Seta direcao="direita" className="hidden h-3 w-10 text-neon md:block" /> : null,
  )
  const classePendentes = `${classeItem} ${temPendentes ? 'border-l-4 border-neon' : 'border-l border-cimento'}`

  return (
    <section
      aria-label={rotulo}
      aria-hidden={carregando ? true : undefined}
      className="mt-4 grid grid-cols-3 border-b border-cimento"
    >
      <div className={classeItem}>{item(numeros?.agendados ?? null, plural(numeros?.agendados ?? 0, 'agendado', 'agendados'))}</div>

      {temPendentes && atalho?.tipo === 'botao' ? (
        <button
          type="button"
          aria-label={`${pendentes} ${rotuloPendentes}. Abrir o primeiro.`}
          onClick={(e) => atalho.aoClicar(e.currentTarget)}
          className={`${classePendentes} text-left transition-colors duration-rapida ease-urbz hover:bg-concreto focus-visible:outline-offset-[-4px]`}
        >
          {conteudoPendentes}
        </button>
      ) : temPendentes && atalho?.tipo === 'link' ? (
        <Link
          to={{ search: `?${montarBuscaPainel('dia', atalho.dia, cancelados)}` }}
          // Mesmo state dos dias da semana: a visão Dia leva o foco ao título (este link some ao trocar de visão).
          state={{ focarTitulo: true }}
          aria-label={`${pendentes} ${rotuloPendentes}. Ir ao primeiro dia com pendente.`}
          className={`${classePendentes} transition-colors duration-rapida ease-urbz hover:bg-concreto focus-visible:outline-offset-[-4px]`}
        >
          {conteudoPendentes}
        </Link>
      ) : (
        <div className={classePendentes}>{conteudoPendentes}</div>
      )}

      <div className={`${classeItem} border-l border-cimento`}>
        {item(numeros?.confirmados ?? null, plural(numeros?.confirmados ?? 0, 'confirmado', 'confirmados'))}
      </div>
    </section>
  )
}
