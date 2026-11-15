import { Link } from 'react-router'
import { formatarDDMM, formatarDiaSemana } from '../../lib/agendar/datas.ts'
import { useCancelados } from '../../hooks/useCancelados.ts'
import { montarBuscaPainel } from '../../lib/painel/busca.ts'
import type { ResumoDia } from '../../lib/painel/semana.ts'

interface Props {
  resumo: ResumoDia
  ehHoje: boolean
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// Um dia da semana. É um link para a visão Dia daquele dia (Enter e clique funcionam, e dá para abrir em outra aba).
// No celular é uma linha da lista; a partir de lg, uma das 7 colunas. Sem cartão com sombra: faixas
// separadas por linha fina, com o número grande como destaque.
export default function CartaoDiaSemana({ resumo, ehHoje }: Props) {
  const { dia, fechado, total, pendentes, porBarbeiro, bloqueios } = resumo
  const cancelados = useCancelados() // o filtro ligado na Semana vale também no Dia aberto pelo cartão
  const semana = formatarDiaSemana(dia)
  const ddmm = formatarDDMM(dia)

  // O nome acessível resume o dia inteiro (o conteúdo visual fica escondido para não ser lido duas vezes).
  const partes = [
    `${semana}, ${ddmm}`,
    ehHoje ? 'hoje' : null,
    fechado ? 'fechado' : null,
    total > 0 ? plural(total, 'atendimento', 'atendimentos') : 'sem atendimentos',
    pendentes > 0 ? plural(pendentes, 'pendente', 'pendentes') : null,
    bloqueios.length > 0 ? plural(bloqueios.length, 'bloqueio', 'bloqueios') : null,
  ].filter((p) => p !== null)

  return (
    <Link
      to={{ search: `?${montarBuscaPainel('dia', dia, cancelados)}` }}
      // Avisa a visão Dia de que veio daqui: ela leva o foco ao título (o link some ao trocar de visão).
      state={{ focarTitulo: true }}
      aria-label={partes.join(', ')}
      aria-current={ehHoje ? 'date' : undefined}
      className={`group relative grid h-full grid-cols-[4.5rem_1fr] content-start gap-x-4 gap-y-3 p-4 transition-colors duration-rapida ease-urbz hover:bg-concreto focus-visible:outline-offset-[-4px] lg:grid-cols-1 lg:border-t-4 lg:p-3 ${
        // lg: todas as colunas têm a borda de 4px no topo (transparente, menos a de hoje): o conteúdo de hoje não desce.
        ehHoje ? 'border-l-4 border-neon bg-asfalto lg:border-l-0' : 'lg:border-transparent'
      } ${fechado && total === 0 && !ehHoje ? 'bg-asfalto' : ''}`}
    >
      <div aria-hidden="true">
        <span className="block font-display text-3xl leading-none text-branco uppercase">{semana.slice(0, 3) /* seg, ter, qua... */}</span>
        <span className="mt-1 block font-corpo text-sm text-cinza-claro">{ddmm}</span>
        {ehHoje && (
          <span className="mt-1 block font-corpo text-xs font-semibold tracking-widest text-neon uppercase">Hoje</span>
        )}
      </div>

      <div aria-hidden="true" className="min-w-0 space-y-3">
        {fechado && <p className="font-corpo text-xs font-semibold tracking-widest text-chumbo uppercase">Fechado</p>}

        {total > 0 ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-display-sm leading-none text-branco">{total}</span>
              <span className="font-corpo text-sm text-cinza-claro">{total === 1 ? 'atendimento' : 'atendimentos'}</span>
            </p>
            {pendentes > 0 && (
              <p className="border-l-2 border-neon pl-2 font-corpo text-sm font-semibold text-neon">
                {plural(pendentes, 'pendente', 'pendentes')}
              </p>
            )}
            <ul className="divide-y divide-cimento border-y border-cimento font-corpo text-sm">
              {porBarbeiro.map((b) => (
                <li key={b.barbeiroId} className="flex items-baseline justify-between gap-2 py-1">
                  <span className="truncate text-cinza-claro">{b.nome}</span>
                  <span className="shrink-0 font-semibold text-branco">{b.quantidade}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          !fechado && <p className="font-corpo text-sm text-chumbo">Sem atendimentos</p>
        )}

        {bloqueios.length > 0 && (
          <p className="relative overflow-hidden border-y border-cimento">
            <span className="listras absolute inset-0 text-cimento" />
            <span className="relative inline-block bg-preto px-2 py-0.5 font-corpo text-xs font-semibold tracking-widest text-cinza-claro uppercase">
              {plural(bloqueios.length, 'bloqueio', 'bloqueios')}
            </span>
          </p>
        )}
      </div>
    </Link>
  )
}
