import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { mascararTelefone } from '../../lib/agendar/dados.ts'
import { linkParaCliente } from '../../lib/agendar/mensagem.ts'
import type { ResultadoStatus } from '../../lib/painel/api.ts'
import { acoesDisponiveis, TRAVA_2A_ETAPA_MS, type AcaoAgendamento, type IdAcao } from '../../lib/painel/acoes.ts'
import { formatarFaixaHora, rotuloDia, rotuloStatus, type Agendamento } from '../../lib/painel/agenda.ts'
import { mensagemErroStatus } from '../../lib/painel/erroStatus.ts'

interface Props {
  agendamento: Agendamento
  /** Instante atual em ms: decide quando "Concluir" e "Não compareceu" passam a aparecer. */
  agora: number
  /** Muda o status no servidor. Quem chama atualiza a agenda quando dá certo. */
  aoMudarStatus: (id: string, destino: Agendamento['status']) => Promise<ResultadoStatus>
  /** O diálogo já fechou (botão, Esc ou clique fora). Quem chama devolve o foco ao bloco. */
  aoFechar: () => void
}

const BASE_BOTAO =
  'inline-flex min-h-12 w-full items-center justify-center gap-3 px-5 font-display text-2xl tracking-wider uppercase transition-colors duration-rapida ease-urbz disabled:cursor-wait disabled:opacity-50'

// Neon só na ação principal. Cancelar e faltou ficam em contorno (chumbo, de 3:1 sobre o fundo) e, na
// 2ª etapa, viram branco sólido com a faixa de listras "////" no canto: o alerta é de forma, não de cor nova.
function classeDoBotao(acao: AcaoAgendamento, pedindo: boolean): string {
  if (acao.principal) return `${BASE_BOTAO} bg-neon text-preto hover:bg-branco`
  if (pedindo) return `${BASE_BOTAO} bg-branco text-preto hover:bg-cinza-claro`
  return `${BASE_BOTAO} border-2 border-chumbo text-branco hover:border-branco`
}

function Campo({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-b border-cimento py-3">
      <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">{nome}</dt>
      <dd className="font-corpo text-base break-words text-branco">{children}</dd>
    </div>
  )
}

/**
 * Detalhes e ações de um agendamento. É um <dialog> nativo aberto com showModal(): o navegador
 * prende o foco dentro, deixa o resto da página inerte, fecha com Esc e devolve o foco a quem abriu.
 * Celular: folha que sobe da base da tela. Desktop (md): painel na lateral direita.
 */
export default function DetalhesAgendamento({ agendamento: a, agora, aoMudarStatus, aoFechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const botoes = useRef(new Map<IdAcao, HTMLButtonElement>())
  /** Para onde o foco vai quando o "salvando" termina: o título (deu certo) ou o botão que errou. */
  const focoDepois = useRef<IdAcao | 'titulo' | null>(null)

  const [salvando, setSalvando] = useState<IdAcao | null>(null)
  // Cancelar e faltou pedem um segundo clique: aqui fica qual deles está esperando.
  const [pedindo, setPedindo] = useState<IdAcao | null>(null)
  // Enquanto true, o botão da 2ª etapa ignora cliques (aria-disabled). A ref vale na hora, mesmo no 2º clique do duplo toque.
  const [travado, setTravado] = useState(false)
  const travadoRef = useRef(false)
  const timerTrava = useRef<number | undefined>(undefined)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  // Abre como modal. Sem cleanup que feche: tirar o <dialog> da árvore já o tira da camada de topo
  // (e fechar aqui dispararia o evento "close" tarde, depois do desmonte).
  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) d.showModal()
  }, [])

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

  // Botão desabilitado perde o foco; quando o salvamento termina, o foco volta para um lugar útil.
  useEffect(() => {
    if (salvando !== null) return
    const alvo = focoDepois.current
    focoDepois.current = null
    if (alvo === 'titulo') titulo.current?.focus()
    else if (alvo) botoes.current.get(alvo)?.focus()
  }, [salvando])

  useEffect(() => () => window.clearTimeout(timerTrava.current), [])

  const acoes = acoesDisponiveis(a.status, a.inicio, agora)
  const ocupado = salvando !== null
  // A pergunta só vale enquanto a ação ainda existe: se outra pessoa mudou o status e a atualização da agenda
  // chegou, a ação some e a pergunta some junto (derivado, não fica "órfã").
  const acaoPedida = acoes.find((x) => x.id === pedindo)

  async function executar(acao: AcaoAgendamento) {
    setPedindo(null)
    setAviso('')
    setErro('')
    setSalvando(acao.id)
    const resultado = await aoMudarStatus(a.id, acao.destino)
    if (resultado.ok) {
      setAviso(acao.sucesso)
      focoDepois.current = 'titulo'
    } else {
      setErro(mensagemErroStatus(resultado.erro))
      focoDepois.current = acao.id
    }
    setSalvando(null)
  }

  function aoClicarNaAcao(acao: AcaoAgendamento) {
    if (acao.confirmacao !== null && acaoPedida?.id !== acao.id) {
      setErro('')
      setAviso('')
      setPedindo(acao.id)
      travadoRef.current = true
      setTravado(true)
      window.clearTimeout(timerTrava.current)
      timerTrava.current = window.setTimeout(() => {
        travadoRef.current = false
        setTravado(false)
      }, TRAVA_2A_ETAPA_MS)
      return
    }
    if (acao.confirmacao !== null && travadoRef.current) return
    void executar(acao)
  }

  function voltarDaConfirmacao(id: IdAcao) {
    setPedindo(null)
    setAviso('')
    botoes.current.get(id)?.focus()
  }

  // Clique no fundo escuro: o alvo é o próprio <dialog> (o conteúdo ocupa tudo o que não é fundo).
  function aoClicarNoFundo(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget && !ocupado) e.currentTarget.close()
  }

  // O <dialog> modal já deixa a página atrás inerte, mas sozinho o Tab do último botão sai para a barra do
  // navegador (o activeElement vira o body; testado no e2e "o Tab não escapa dele", que falha sem isto).
  // Aqui ele dá a volta: do último vai ao primeiro, e Shift+Tab do primeiro vai ao último (foco preso).
  function prenderFoco(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return
    const focaveis = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (!primeiro) return
    const ativo = document.activeElement
    if (e.shiftKey && (ativo === primeiro || !e.currentTarget.contains(ativo) || ativo === titulo.current)) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && ativo === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  const dia = rotuloDia(a.inicio)
  const link = linkParaCliente(a.clienteTelefone, { nome: a.clienteNome, inicio: a.inicio })

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="detalhes-titulo"
      onClose={aoFechar}
      // Esc durante o salvamento não fecha: o resultado ainda vai chegar e o aviso apareceria para ninguém.
      onCancel={(e) => {
        if (ocupado) e.preventDefault()
      }}
      onClick={aoClicarNoFundo}
      onKeyDown={prenderFoco}
      className="painel-folha fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90svh] w-full max-w-none overflow-y-auto overscroll-contain border-t border-cimento bg-asfalto text-cinza-claro backdrop:bg-preto/80 md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:border-t-0 md:border-l"
    >
      <div className="md:min-h-full">
        <div aria-hidden="true" className="listras h-3 text-cimento" />
        <div className="px-gutter pt-5 pb-8 md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-corpo text-sm tracking-widest text-chumbo uppercase">Agendamento</p>
              <h2
                id="detalhes-titulo"
                ref={titulo}
                tabIndex={-1}
                className="mt-1 text-display-sm break-words outline-offset-4"
              >
                {a.clienteNome}
              </h2>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => dialogo.current?.close()}
              className="inline-flex min-h-11 shrink-0 items-center border border-chumbo px-4 font-corpo text-sm font-semibold tracking-widest text-branco uppercase transition-colors duration-rapida ease-urbz hover:border-branco disabled:cursor-wait disabled:opacity-50"
            >
              Fechar
            </button>
          </div>

          <dl className="mt-6 border-t border-cimento">
            <Campo nome="Status">
              <span className="font-semibold tracking-wide uppercase">{rotuloStatus(a.status, a.expiradoEm != null)}</span>
            </Campo>
            <Campo nome="Telefone">{mascararTelefone(a.clienteTelefone)}</Campo>
            <Campo nome="Serviço">{a.servicoNome}</Campo>
            <Campo nome="Barbeiro">{a.barbeiroNome}</Campo>
            <Campo nome="Dia">
              <span className="capitalize">{dia}</span>
            </Campo>
            <Campo nome="Horário">
              {formatarFaixaHora(a.inicio, a.fim)}
            </Campo>
            <Campo nome="Código">
              <span className="font-semibold tracking-widest">{a.codigo}</span>
            </Campo>
          </dl>

          {/* Sempre na tela (vazia até haver o que dizer): leitor de tela só anuncia região que já existia. */}
          <p role="status" className="mt-5 min-h-6 font-corpo text-base text-branco">
            {acaoPedida?.pergunta ?? aviso}
          </p>
          {erro !== '' && (
            <p role="alert" className="mt-3 border-l-4 border-branco bg-concreto px-4 py-3 font-corpo text-base text-branco">
              {erro}
            </p>
          )}

          <div className="mt-5 grid gap-3" aria-busy={ocupado}>
            {acoes.map((acao) => {
              const naSegundaEtapa = acaoPedida?.id === acao.id
              const estaSalvando = salvando === acao.id
              return (
                <div key={acao.id} className="grid gap-2">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) botoes.current.set(acao.id, el)
                      else botoes.current.delete(acao.id)
                    }}
                    disabled={ocupado}
                    aria-disabled={naSegundaEtapa && travado ? true : undefined}
                    aria-label={naSegundaEtapa ? undefined : (acao.nomeAcessivel ?? undefined)}
                    onClick={() => aoClicarNaAcao(acao)}
                    className={classeDoBotao(acao, naSegundaEtapa)}
                  >
                    {naSegundaEtapa && <span aria-hidden="true" className="listras h-5 w-6 shrink-0 text-preto" />}
                    {estaSalvando ? 'Salvando…' : naSegundaEtapa ? acao.confirmacao : acao.rotulo}
                  </button>
                  {naSegundaEtapa && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => voltarDaConfirmacao(acao.id)}
                      className="inline-flex min-h-11 items-center justify-center font-corpo text-sm font-semibold tracking-widest text-cinza-claro uppercase underline underline-offset-4 hover:text-branco"
                    >
                      Voltar
                    </button>
                  )}
                </div>
              )
            })}

            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 border-2 border-branco px-5 font-display text-2xl tracking-wider text-branco uppercase transition-colors duration-rapida ease-urbz hover:bg-branco hover:text-preto"
            >
              Chamar no WhatsApp
              <span className="sr-only"> (abre em outra aba)</span>
            </a>
          </div>
        </div>
      </div>
    </dialog>
  )
}
