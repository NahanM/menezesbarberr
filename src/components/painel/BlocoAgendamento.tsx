import { formatarHHMM } from '../../lib/agendar/datas.ts'
import {
  densidadeDoBloco,
  duracaoEmMinutos,
  formatarFaixaHora,
  rotuloStatus,
  type Agendamento,
  type Faixa,
  type Posicao,
  type StatusAgendamento,
} from '../../lib/painel/agenda.ts'

interface Props {
  agendamento: Agendamento
  posicao: Posicao
  faixa: Faixa
  /** Pede para abrir os detalhes. Recebe o botão clicado para o foco poder voltar a ele ao fechar. */
  aoAbrir: (botao: HTMLButtonElement) => void
}

// Cada status tem cor E texto (nunca só cor). Neon só no que pede atenção: o pendente.
// Cancelado fica atrás dos ativos: nome riscado e opacidade baixa (no wrapper). Os textos dele usam cinza-claro
// em vez de chumbo para que, mesmo com a opacidade, o contraste siga AA (cinza-claro a 70% sobre preto passa de 5:1).
// `detalhe` é a cor da linha do serviço.
const ESTILO_STATUS: Record<StatusAgendamento, { bloco: string; rotulo: string; nome: string; detalhe: string }> = {
  pendente: {
    bloco: 'border-l-4 border-neon bg-concreto',
    rotulo: 'text-neon',
    nome: 'text-branco',
    detalhe: 'text-chumbo',
  },
  confirmado: {
    bloco: 'border-l-4 border-branco bg-concreto',
    rotulo: 'text-branco',
    nome: 'text-branco',
    detalhe: 'text-chumbo',
  },
  concluido: {
    bloco: 'border-l-4 border-chumbo bg-asfalto',
    rotulo: 'text-cinza-claro',
    nome: 'text-cinza-claro',
    detalhe: 'text-chumbo',
  },
  nao_compareceu: {
    bloco: 'border border-dashed border-chumbo bg-preto',
    rotulo: 'text-branco',
    nome: 'text-cinza-claro',
    detalhe: 'text-chumbo',
  },
  cancelado: {
    bloco: 'border border-cimento bg-preto',
    rotulo: 'text-cinza-claro',
    nome: 'text-cinza-claro line-through',
    detalhe: 'text-cinza-claro',
  },
}

// Um atendimento na grade. A posição vem em % da altura do dia; a faixa divide a coluna quando
// há sobreposição (um cancelado no meio). O bloco é um <button>: Enter, espaço e clique abrem os
// detalhes e as ações (DetalhesAgendamento). Botão não aceita <p> dentro, por isso os textos são <span block>.
export default function BlocoAgendamento({ agendamento: a, posicao, faixa, aoAbrir }: Props) {
  const minutos = duracaoEmMinutos(a.inicio, a.fim)
  const densidade = densidadeDoBloco(minutos)
  const estilo = ESTILO_STATUS[a.status] ?? ESTILO_STATUS.pendente
  const hora = formatarFaixaHora(a.inicio, a.fim)
  const status = rotuloStatus(a.status, a.expiradoEm != null)
  // Sobreposto a outro (faixa dividida) e com altura para 3 linhas (40 min = 64px).
  const lado = faixa.total > 1 && minutos >= 40
  const cancelado = a.status === 'cancelado'

  return (
    <div
      // Camadas: ativo (z-[2]) sempre acima do cancelado (z-[1]); o foco traz qualquer um para a frente (z-10).
      // O cancelado esmaece (opacity) e volta ao normal ao passar o mouse ou focar, para dar para ler antes de abrir.
      className={`absolute p-px focus-within:z-10 ${
        cancelado ? 'z-[1] opacity-70 transition-opacity duration-rapida ease-urbz hover:opacity-100 focus-within:opacity-100' : 'z-[2]'
      }`}
      style={{
        top: `${posicao.topoPct}%`,
        height: `${posicao.alturaPct}%`,
        left: `${(faixa.indice / faixa.total) * 100}%`,
        width: `${100 / faixa.total}%`,
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(e) => aoAbrir(e.currentTarget)}
        aria-label={`${hora}, ${a.clienteNome}, ${a.servicoNome}, ${status}`}
        className={`block h-full w-full cursor-pointer overflow-hidden px-2 text-left font-corpo leading-tight transition-[filter] duration-rapida ease-urbz hover:brightness-125 ${densidade === 'linha' ? 'py-0.5' : 'py-1'} ${estilo.bloco}`}
      >
        {densidade === 'linha' ? (
          <span className="block truncate text-xs">
            <span className="font-semibold text-cinza-claro">{formatarHHMM(a.inicio)}</span>{' '}
            <span className={`font-semibold ${estilo.nome}`}>{a.clienteNome}</span>{' '}
            <span className={`uppercase ${estilo.rotulo}`}>{status}</span>
          </span>
        ) : (
          <>
            <span className="block truncate text-xs tracking-wide text-cinza-claro">
              <span className="font-semibold">{hora}</span>
              {!lado && <span className={`uppercase ${estilo.rotulo}`}> {status}</span>}
            </span>
            <span className={`block truncate text-sm font-semibold ${estilo.nome}`}>{a.clienteNome}</span>
            {/* Lado a lado (faixa estreita) o status ganha linha própria para não ser cortado; o serviço fica no aria-label. */}
            {lado && <span className={`block truncate text-xs uppercase ${estilo.rotulo}`}>{status}</span>}
            {!lado && densidade === 'completa' && (
              <span className={`block truncate text-xs ${estilo.detalhe}`}>{a.servicoNome}</span>
            )}
          </>
        )}
      </button>
    </div>
  )
}
