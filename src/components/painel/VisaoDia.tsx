import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAgendaDia } from '../../hooks/useAgendaDia.ts'
import { useCancelados } from '../../hooks/useCancelados.ts'
import { barbeariaAbre, diaDaSemana, hojeEmSP, type DiaISO } from '../../lib/agendar/datas.ts'
import { criarBloqueio, mudarStatus, removerBloqueio } from '../../lib/painel/api.ts'
import { avisoBloqueioCriado, limparMotivo, type PedidoBloqueio } from '../../lib/painel/bloqueio.ts'
import { bloqueioDesatualizado } from '../../lib/painel/erroBloqueio.ts'
import {
  contarAtendimentos,
  minutoNoDia,
  type Agendamento,
  type BarbeiroAtivo,
  type Bloqueio,
  type ColunaBarbeiro,
} from '../../lib/painel/agenda.ts'
import {
  colunasComFiltro,
  contarCancelados,
  avisoCancelados,
  mostrarBotaoCancelados,
  PARAM_CANCELADOS,
  rotuloBotaoCancelados,
} from '../../lib/painel/cancelados.ts'
import { agendaDesatualizada } from '../../lib/painel/erroStatus.ts'
import { CarregandoAgenda, ErroAgenda } from './AvisosAgenda.tsx'
import DetalhesAgendamento from './DetalhesAgendamento.tsx'
import DetalhesBloqueio from './DetalhesBloqueio.tsx'
import GradeAgenda from './GradeAgenda.tsx'
import NavegacaoDia from './NavegacaoDia.tsx'
import NovoBloqueio from './NovoBloqueio.tsx'
import ResumoPeriodo from './ResumoPeriodo.tsx'

interface Props {
  dia: DiaISO
  hoje: DiaISO
  /** Instante atual em ms (para a linha "agora"). */
  agora: number
  aoIrPara: (dia: DiaISO) => void
}

/**
 * O que está aberto por cima da agenda (só um por vez, porque o diálogo é modal). Guarda o dia junto:
 * se a pessoa voltar a este dia depois de navegar, o diálogo não reabre sozinho. Guarda só o id (não o
 * objeto) para o diálogo sempre mostrar o dado mais novo da agenda.
 */
type Aberto =
  | { tipo: 'agendamento'; id: string; dia: DiaISO }
  | { tipo: 'bloqueio'; id: string; dia: DiaISO }
  | { tipo: 'novo-bloqueio'; dia: DiaISO }

const SEM_BARBEIROS: BarbeiroAtivo[] = []
const SEM_COLUNAS: ColunaBarbeiro[] = []

// Visão "Dia": colunas por barbeiro com a grade de horas.
export default function VisaoDia({ dia, hoje, agora, aoIrPara }: Props) {
  // Cancelados: ficam fora da grade por padrão; o botão liga, e a escolha mora na URL (?cancelados=1), como o ?dia=.
  const mostrarCancelados = useCancelados()
  const agenda = useAgendaDia(dia, mostrarCancelados)
  const titulo = useRef<HTMLHeadingElement>(null)

  // Aberta pelo link de um dia da semana (state { focarTitulo }): o link some ao trocar de visão, e o foco
  // cairia no body. Leva o foco ao título e rola para o topo. Depois limpa o state (replace) para recarregar
  // a página, ou voltar para esta entrada do histórico, não repetir isso.
  const location = useLocation()
  const navigate = useNavigate()
  const veioDaSemana = (location.state as { focarTitulo?: boolean } | null)?.focarTitulo === true
  useEffect(() => {
    if (!veioDaSemana) return
    titulo.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [veioDaSemana, navigate, location.pathname, location.search])
  const [, setParams] = useSearchParams()
  // Colunas completas (resumo e detalhes usam estas) e as filtradas, que são as que a grade desenha.
  const colunasDaAgenda = agenda.status === 'ok' ? agenda.colunas : SEM_COLUNAS
  // Todos os agendamentos do dia (inclui cancelados): resumo, detalhes e o número do botão usam esta lista.
  const doDia = useMemo(() => colunasDaAgenda.flatMap((c) => c.agendamentos), [colunasDaAgenda])
  const colunasDaGrade = useMemo(
    () => colunasComFiltro(colunasDaAgenda, mostrarCancelados),
    [colunasDaAgenda, mostrarCancelados],
  )

  // Aba do celular: fica aqui (e não na grade) para a escolha sobreviver ao "carregando" ao trocar de dia.
  const [barbeiroEscolhido, setBarbeiroEscolhido] = useState<string | null>(null)

  const [aberto, setAberto] = useState<Aberto | null>(null)
  // Quem abriu o diálogo (bloco da grade ou botão "Bloquear horário"): ao fechar, o foco volta para ele.
  const gatilho = useRef<HTMLElement | null>(null)
  const botaoBloquear = useRef<HTMLButtonElement>(null)
  // Remover o bloqueio faz o bloco sumir da grade: nesse caso o foco vai ao botão "Bloquear horário".
  const focoNoBotaoBloquear = useRef(false)
  const { atualizar, aplicar, aplicarBloqueios } = agenda

  // Frase da última ação em bloqueio (criou, removeu). Fica numa região aria-live sempre presente.
  const [aviso, setAviso] = useState<{ dia: DiaISO; texto: string } | null>(null)
  // Ao trocar de dia o aviso do dia anterior sai (ajuste de estado durante a renderização, o jeito indicado pelo React).
  if (aviso !== null && aviso.dia !== dia) setAviso(null)

  const abrirAgendamento = useCallback(
    (a: Agendamento, botao: HTMLButtonElement) => {
      gatilho.current = botao
      setAberto({ tipo: 'agendamento', id: a.id, dia })
    },
    [dia],
  )

  const abrirBloqueio = useCallback(
    (k: Bloqueio, botao: HTMLButtonElement) => {
      gatilho.current = botao
      setAberto({ tipo: 'bloqueio', id: k.id, dia })
    },
    [dia],
  )

  const abrirNovoBloqueio = () => {
    gatilho.current = botaoBloquear.current
    setAberto({ tipo: 'novo-bloqueio', dia })
  }

  const fechar = useCallback(() => {
    setAberto(null)
    const alvo =
      focoNoBotaoBloquear.current || !gatilho.current?.isConnected ? botaoBloquear.current : gatilho.current
    alvo?.focus()
    focoNoBotaoBloquear.current = false
    gatilho.current = null
  }, [])

  // Muda o status; deu certo, aplica a linha que o servidor devolveu (a tela muda na hora) e rebusca em silêncio.
  // Erro de "já mudou" ou "não existe" também rebusca: a agenda na tela está velha.
  const aoMudarStatus = useCallback(
    async (id: string, destino: Agendamento['status']) => {
      const resultado = await mudarStatus(id, destino)
      if (resultado.ok) {
        aplicar(resultado.agendamento)
        atualizar()
      } else if (agendaDesatualizada(resultado.erro)) {
        atualizar()
      }
      return resultado
    },
    [aplicar, atualizar],
  )

  const barbeiros = agenda.status === 'ok' ? agenda.barbeiros : SEM_BARBEIROS

  // Cria o bloqueio. Deu certo: ele entra na grade na hora (se for neste dia), a agenda rebusca em silêncio e
  // o aviso diz o que aconteceu, inclusive quantos agendamentos já estavam dentro do período.
  const aoCriarBloqueio = useCallback(
    async (pedido: PedidoBloqueio) => {
      const resultado = await criarBloqueio(pedido)
      if (resultado.ok) {
        const barbeiroNome = barbeiros.find((b) => b.id === pedido.barbeiroId)?.nome ?? null
        if (hojeEmSP(new Date(pedido.inicio)) === dia) {
          const novo: Bloqueio = {
            id: resultado.id,
            barbeiroId: pedido.barbeiroId,
            barbeiroNome,
            inicio: pedido.inicio,
            fim: pedido.fim,
            motivo: limparMotivo(pedido.motivo),
          }
          aplicarBloqueios((atuais) => [...atuais, novo])
        }
        atualizar()
        setAviso({
          dia,
          texto: avisoBloqueioCriado({ barbeiroNome, inicio: pedido.inicio, fim: pedido.fim, conflitos: resultado.conflitos }),
        })
      } else if (bloqueioDesatualizado(resultado.erro)) {
        atualizar()
      }
      return resultado
    },
    [barbeiros, dia, aplicarBloqueios, atualizar],
  )

  const aoRemoverBloqueio = useCallback(
    async (id: string) => {
      const resultado = await removerBloqueio(id)
      if (resultado.ok) {
        focoNoBotaoBloquear.current = true
        aplicarBloqueios((atuais) => atuais.filter((k) => k.id !== id))
        atualizar()
        setAviso({ dia, texto: 'Bloqueio removido.' })
      } else if (bloqueioDesatualizado(resultado.erro)) {
        atualizar()
      }
      return resultado
    },
    [dia, aplicarBloqueios, atualizar],
  )

  const detalhesDoDia = agenda.status === 'ok' && aberto !== null && aberto.tipo !== 'novo-bloqueio' && aberto.dia === dia
  const agendamentoAberto =
    detalhesDoDia && aberto.tipo === 'agendamento'
      ? doDia.find((a) => a.id === aberto.id)
      : undefined
  const bloqueioAberto =
    detalhesDoDia && aberto.tipo === 'bloqueio'
      ? agenda.colunas.flatMap((c) => c.bloqueios).find((k) => k.id === aberto.id)
      : undefined

  // A busca silenciosa pode deixar de devolver o item aberto (apagado ou movido por outra pessoa).
  // O diálogo some da árvore sem disparar "close", então o estado e o foco seriam deixados sujos: fecha aqui.
  const sumiu =
    agenda.status === 'ok' &&
    aberto !== null &&
    aberto.tipo !== 'novo-bloqueio' &&
    agendamentoAberto === undefined &&
    bloqueioAberto === undefined
  useEffect(() => {
    // setState no efeito é intencional: o diálogo já saiu da tela sem passar pelo "close", e só aqui dá para
    // limpar o estado e devolver o foco depois que a árvore mudou. Roda uma vez (sumiu vira false em seguida).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sumiu) fechar()
  }, [sumiu, fechar])

  const agoraMin = dia === hoje ? minutoNoDia(new Date(agora).toISOString(), dia) : null
  const podeBloquear = agenda.status === 'ok' && agenda.barbeiros.length > 0

  // Números do resumo: mesma conta da Semana (contarAtendimentos). null enquanto carrega; no erro o resumo some.
  const contagem = agenda.status === 'ok' ? contarAtendimentos(doDia) : null
  const totalCancelados = contarCancelados(doDia)
  // Alterna o filtro (a escolha mora na URL). A frase vai para a região aria-live: trocar o nome do botão com o foco
  // nele não costuma ser anunciado. Ligado e sem nenhum cancelado, desligar faz o botão sair da tela: o foco vai para "Bloquear horário".
  const alternarCancelados = () => {
    if (mostrarCancelados && totalCancelados === 0) botaoBloquear.current?.focus()
    setAviso({ dia, texto: avisoCancelados(totalCancelados, !mostrarCancelados) })
    setParams(
      (atuais) => {
        const proximos = new URLSearchParams(atuais)
        if (mostrarCancelados) proximos.delete(PARAM_CANCELADOS)
        else proximos.set(PARAM_CANCELADOS, '1')
        return proximos
      },
      { replace: true }, // é um filtro da mesma tela: não enche o histórico do "voltar"
    )
  }
  // Tocar em "pendentes" abre os detalhes do primeiro pendente do dia (o mesmo diálogo do clique no bloco).
  const abrirPrimeiroPendente = (botao: HTMLButtonElement) => {
    const alvo = doDia.find((a) => a.id === contagem?.primeiroPendenteId)
    if (alvo) abrirAgendamento(alvo, botao)
  }

  return (
    <div>
      <NavegacaoDia dia={dia} hoje={hoje} aoIrPara={aoIrPara} tituloRef={titulo} />

      {agenda.status !== 'erro' && (
        <ResumoPeriodo
          rotulo="Resumo do dia"
          numeros={contagem}
          atalho={{ tipo: 'botao', aoClicar: abrirPrimeiroPendente }}
        />
      )}

      {/* Uma barra só: Bloquear à esquerda, Mostrar cancelados à direita (no celular, se não couber, quebra em 2 linhas). */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          ref={botaoBloquear}
          type="button"
          aria-haspopup="dialog"
          disabled={!podeBloquear}
          onClick={abrirNovoBloqueio}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 border-2 border-branco px-5 font-display text-2xl tracking-wider text-branco uppercase transition-colors duration-rapida ease-urbz hover:bg-branco hover:text-preto disabled:cursor-not-allowed disabled:border-chumbo disabled:text-chumbo disabled:hover:bg-transparent disabled:hover:text-chumbo"
        >
          <span aria-hidden="true" className="listras h-4 w-5 shrink-0" />
          Bloquear horário
        </button>
        {agenda.status === 'ok' && agenda.colunas.length > 0 && mostrarBotaoCancelados(totalCancelados, mostrarCancelados) && (
          /* Botão com rótulo que muda ("Mostrar"/"Ocultar"): sem aria-pressed, para não duplicar o estado num rótulo que já o diz. O fundo branco só reforça para quem vê. */
          <button
            type="button"
            onClick={alternarCancelados}
            className={`ml-auto inline-flex min-h-12 items-center gap-2 border px-4 font-corpo text-sm tracking-widest uppercase transition-colors duration-rapida ease-urbz ${
              mostrarCancelados
                ? 'border-branco bg-branco text-preto'
                : 'border-chumbo text-cinza-claro hover:border-branco hover:text-branco'
            }`}
          >
            {rotuloBotaoCancelados(totalCancelados, mostrarCancelados)}
          </button>
        )}
      </div>

      {/* Região viva sempre na tela (vazia até haver o que dizer): leitor de tela só anuncia região que já existia. aria-live em vez de role=status, que a agenda já usa para "carregando" e "vazio". */}
      <p
        aria-live="polite"
        aria-atomic="true"
        className={`min-w-0 font-corpo text-base text-branco empty:sr-only sm:max-w-xl ${
          aviso ? 'mt-3 border-l-4 border-neon bg-concreto px-4 py-3' : ''
        }`}
      >
        {aviso?.texto}
      </p>

      <div className="mt-6">
        {agenda.status === 'carregando' && <CarregandoAgenda />}
        {agenda.status === 'erro' && <ErroAgenda aoTentarDeNovo={agenda.tentarDeNovo} />}

        {agenda.status === 'ok' && agenda.colunas.length === 0 && (
          <p role="status" className="border-2 border-cimento p-6">
            Nenhum barbeiro ativo. Cadastre ou reative um barbeiro para ver a agenda.
          </p>
        )}

        {agenda.status === 'ok' && agenda.colunas.length > 0 && (
          <>
            {agenda.vazio && (
              <p role="status" className="mb-6 border-l-4 border-neon bg-concreto px-4 py-3 text-branco">
                Nenhum agendamento neste dia.
                {!barbeariaAbre(diaDaSemana(dia)) && ' A barbearia não abre neste dia.'}
              </p>
            )}
            <GradeAgenda
              colunas={colunasDaGrade}
              grade={agenda.grade}
              dia={dia}
              agoraMin={agoraMin}
              escolhida={barbeiroEscolhido}
              aoEscolher={setBarbeiroEscolhido}
              aoAbrir={abrirAgendamento}
              aoAbrirBloqueio={abrirBloqueio}
            />
          </>
        )}
      </div>

      {agendamentoAberto && (
        <DetalhesAgendamento
          key={agendamentoAberto.id}
          agendamento={agendamentoAberto}
          agora={agora}
          aoMudarStatus={aoMudarStatus}
          aoFechar={fechar}
        />
      )}

      {bloqueioAberto && (
        <DetalhesBloqueio key={bloqueioAberto.id} bloqueio={bloqueioAberto} aoRemover={aoRemoverBloqueio} aoFechar={fechar} />
      )}

      {aberto?.tipo === 'novo-bloqueio' && (
        <NovoBloqueio dia={aberto.dia} barbeiros={barbeiros} aoCriar={aoCriarBloqueio} aoFechar={fechar} />
      )}
    </div>
  )
}
