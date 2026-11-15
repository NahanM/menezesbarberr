import { formatarFaixaHora, type Bloqueio, type Posicao } from '../../lib/painel/agenda.ts'

interface Props {
  bloqueio: Bloqueio
  posicao: Posicao
  /** Pede para abrir os detalhes. Recebe o botão clicado para o foco poder voltar a ele ao fechar. */
  aoAbrir: (botao: HTMLButtonElement) => void
}

// Bloqueio (folga ou compromisso): fundo hachurado com as listras "////" da identidade, atrás dos
// agendamentos. É um <button>: Enter, espaço e clique abrem os detalhes (DetalhesBloqueio), onde dá para
// removê-lo. O motivo vem de texto livre digitado pela equipe; o React escapa, então é seguro.
// Botão não aceita <p> dentro, por isso os textos são <span>.
export default function BlocoBloqueio({ bloqueio: k, posicao, aoAbrir }: Props) {
  const motivo = k.motivo.trim() === '' ? 'Bloqueado' : k.motivo
  const hora = formatarFaixaHora(k.inicio, k.fim)
  const quem = k.barbeiroId === null ? 'toda a barbearia' : (k.barbeiroNome ?? 'barbeiro')

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => aoAbrir(e.currentTarget)}
      aria-label={`Bloqueio, ${hora}, ${quem}: ${motivo}`}
      className="absolute inset-x-0 block cursor-pointer overflow-hidden border-y border-cimento bg-asfalto text-left transition-colors duration-rapida ease-urbz hover:bg-concreto focus-visible:z-10"
      style={{ top: `${posicao.topoPct}%`, height: `${posicao.alturaPct}%` }}
    >
      <span aria-hidden="true" className="listras absolute inset-0 block text-cimento" />
      <span className="relative block max-w-full truncate bg-preto px-2 py-0.5 font-corpo text-xs font-semibold tracking-widest text-cinza-claro uppercase w-fit">
        {k.barbeiroId === null && <span className="text-neon">Todos · </span>}
        {motivo}
      </span>
    </button>
  )
}
