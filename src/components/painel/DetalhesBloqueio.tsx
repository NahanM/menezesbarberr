import { useEffect, useRef, useState } from 'react'
import { hojeEmSP } from '../../lib/agendar/datas.ts'
import { TRAVA_2A_ETAPA_MS } from '../../lib/painel/acoes.ts'
import { formatarFaixaHora, rotuloDia, type Bloqueio } from '../../lib/painel/agenda.ts'
import type { ResultadoRemoverBloqueio } from '../../lib/painel/api.ts'
import { rotuloDeQuem } from '../../lib/painel/bloqueio.ts'
import { mensagemErroBloqueio } from '../../lib/painel/erroBloqueio.ts'
import DialogoPainel, { LinhaDetalhe } from './DialogoPainel.tsx'

interface Props {
  bloqueio: Bloqueio
  /** Remove no servidor. Quem chama atualiza a agenda quando dá certo. */
  aoRemover: (id: string) => Promise<ResultadoRemoverBloqueio>
  /** O diálogo já fechou (botão, Esc ou clique fora). Quem chama devolve o foco. */
  aoFechar: () => void
}

const PERGUNTA = 'Remover este bloqueio? O horário volta a ficar livre para agendar.'

/**
 * Detalhes de um bloqueio (barbeiro, período, motivo) com "Remover bloqueio" em 2 etapas:
 * o 1º clique só pergunta; o 2º remove. A trava de 400 ms é a mesma dos agendamentos.
 */
export default function DetalhesBloqueio({ bloqueio: k, aoRemover, aoFechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const botaoRemover = useRef<HTMLButtonElement>(null)

  const [removendo, setRemovendo] = useState(false)
  const [perguntando, setPerguntando] = useState(false)
  // Enquanto true, o botão da 2ª etapa ignora cliques (aria-disabled). A ref vale na hora, mesmo no 2º clique do duplo toque.
  const [travado, setTravado] = useState(false)
  const travadoRef = useRef(false)
  const timerTrava = useRef<number | undefined>(undefined)
  const [erro, setErro] = useState('')
  const voltarFocoAoBotao = useRef(false)

  useEffect(() => () => window.clearTimeout(timerTrava.current), [])

  // Botão desabilitado perde o foco; ao terminar o salvamento com erro, o foco volta a ele.
  useEffect(() => {
    if (removendo || !voltarFocoAoBotao.current) return
    voltarFocoAoBotao.current = false
    botaoRemover.current?.focus()
  }, [removendo])

  async function remover() {
    setPerguntando(false)
    setErro('')
    setRemovendo(true)
    const resultado = await aoRemover(k.id)
    if (resultado.ok) {
      dialogo.current?.close()
      return
    }
    setErro(mensagemErroBloqueio(resultado.erro))
    voltarFocoAoBotao.current = true
    setRemovendo(false)
  }

  function aoClicar() {
    if (!perguntando) {
      setErro('')
      setPerguntando(true)
      travadoRef.current = true
      setTravado(true)
      window.clearTimeout(timerTrava.current)
      timerTrava.current = window.setTimeout(() => {
        travadoRef.current = false
        setTravado(false)
      }, TRAVA_2A_ETAPA_MS)
      return
    }
    if (travadoRef.current) return
    void remover()
  }

  function voltar() {
    setPerguntando(false)
    botaoRemover.current?.focus()
  }

  const dia = rotuloDia(hojeEmSP(new Date(k.inicio)))

  return (
    <DialogoPainel
      dialogoRef={dialogo}
      sobretitulo="Agenda"
      titulo="Bloqueio"
      idTitulo="bloqueio-detalhes-titulo"
      ocupado={removendo}
      aoFechar={aoFechar}
    >
      <dl className="mt-6 border-t border-cimento">
        <LinhaDetalhe nome="Barbeiro">{rotuloDeQuem(k.barbeiroId === null ? null : (k.barbeiroNome ?? 'Barbeiro'))}</LinhaDetalhe>
        <LinhaDetalhe nome="Dia">
          <span className="capitalize">{dia}</span>
        </LinhaDetalhe>
        <LinhaDetalhe nome="Horário">{formatarFaixaHora(k.inicio, k.fim)}</LinhaDetalhe>
        <LinhaDetalhe nome="Motivo">{k.motivo.trim() === '' ? 'Sem motivo' : k.motivo}</LinhaDetalhe>
      </dl>

      {/* Sempre na tela (vazia até haver o que dizer): leitor de tela só anuncia região que já existia. */}
      <p role="status" className="mt-5 min-h-6 font-corpo text-base text-branco">
        {perguntando ? PERGUNTA : ''}
      </p>
      {erro !== '' && (
        <p role="alert" className="mt-3 border-l-4 border-branco bg-concreto px-4 py-3 font-corpo text-base text-branco">
          {erro}
        </p>
      )}

      <div className="mt-5 grid gap-2" aria-busy={removendo}>
        <button
          ref={botaoRemover}
          type="button"
          disabled={removendo}
          aria-disabled={perguntando && travado ? true : undefined}
          onClick={aoClicar}
          className={`inline-flex min-h-12 w-full items-center justify-center gap-3 px-5 font-display text-2xl tracking-wider uppercase transition-colors duration-rapida ease-urbz disabled:cursor-wait disabled:opacity-50 ${
            perguntando
              ? 'bg-branco text-preto hover:bg-cinza-claro'
              : 'border-2 border-chumbo text-branco hover:border-branco'
          }`}
        >
          {perguntando && <span aria-hidden="true" className="listras h-5 w-6 shrink-0 text-preto" />}
          {removendo ? 'Removendo…' : perguntando ? 'Confirmar remoção?' : 'Remover bloqueio'}
        </button>
        {perguntando && (
          <button
            type="button"
            disabled={removendo}
            onClick={voltar}
            className="inline-flex min-h-11 items-center justify-center font-corpo text-sm font-semibold tracking-widest text-cinza-claro uppercase underline underline-offset-4 hover:text-branco"
          >
            Voltar
          </button>
        )}
      </div>
    </DialogoPainel>
  )
}
