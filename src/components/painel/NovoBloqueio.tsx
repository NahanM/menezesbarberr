import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { hojeEmSP } from '../../lib/agendar/datas.ts'
import type { BarbeiroAtivo } from '../../lib/painel/agenda.ts'
import type { ResultadoCriarBloqueio } from '../../lib/painel/api.ts'
import {
  BARBEARIA_TODA,
  MOTIVO_MAX,
  MOTIVOS_RAPIDOS,
  ORDEM_DOS_CAMPOS,
  janelaDoDia,
  montarPedido,
  validarBloqueio,
  type CampoBloqueio,
  type ErrosBloqueio,
  type FormBloqueio,
  type PedidoBloqueio,
} from '../../lib/painel/bloqueio.ts'
import { mensagemErroBloqueio } from '../../lib/painel/erroBloqueio.ts'
import DialogoPainel from './DialogoPainel.tsx'

interface Props {
  /** Dia aberto na agenda: vem como padrão do campo "Dia". */
  dia: string
  barbeiros: BarbeiroAtivo[]
  /** Cria no servidor. Quem chama atualiza a agenda e o aviso quando dá certo. */
  aoCriar: (pedido: PedidoBloqueio) => Promise<ResultadoCriarBloqueio>
  /** O diálogo já fechou. Quem chama devolve o foco ao botão "Bloquear horário". */
  aoFechar: () => void
}

const classeCampo =
  'block min-h-12 w-full border-2 border-chumbo bg-asfalto px-4 font-corpo text-lg text-branco scheme-dark focus:border-neon aria-invalid:border-neon'
const classeRotulo = 'mb-2 block font-corpo text-sm font-semibold tracking-widest text-cinza-claro uppercase'
const classeBotaoPequeno =
  'inline-flex min-h-11 items-center justify-center border-2 px-4 font-corpo text-sm font-semibold tracking-widest uppercase transition-colors duration-rapida ease-urbz'

/** Rótulo + campo + erro do campo (texto, com o detalhe das listras: o erro nunca depende só de cor). */
function Campo({ id, rotulo, erro, children }: { id: string; rotulo: ReactNode; erro?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={classeRotulo}>
        {rotulo}
      </label>
      {children}
      {erro && (
        <p id={`${id}-erro`} className="mt-2 flex items-start gap-2 font-corpo text-base font-semibold text-neon">
          <span aria-hidden="true" className="listras mt-1.5 h-3 w-5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  )
}

/**
 * Formulário "Bloquear horário": barbeiro (ou a barbearia toda), dia, hora de início e de fim e motivo.
 * A validação aqui é só conforto; o servidor valida de verdade e a mensagem dele aparece em português.
 */
export default function NovoBloqueio({ dia, barbeiros, aoCriar, aoFechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const campos = useRef(new Map<CampoBloqueio, HTMLElement>())
  const primeiroCampo = useRef<HTMLSelectElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  const [form, setForm] = useState<FormBloqueio>({ barbeiro: '', dia, inicio: '', fim: '', motivo: '' })
  const [erros, setErros] = useState<ErrosBloqueio>({})
  // Depois da primeira tentativa de enviar, cada mudança revalida na hora (o erro some assim que o campo é corrigido).
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroServidor, setErroServidor] = useState('')
  const voltarFocoAoBotao = useRef(false)

  // Botão desabilitado perde o foco; ao terminar o salvamento com erro, o foco volta ao botão de salvar.
  useEffect(() => {
    if (salvando || !voltarFocoAoBotao.current) return
    voltarFocoAoBotao.current = false
    botao.current?.focus()
  }, [salvando])

  function mudar(parcial: Partial<FormBloqueio>) {
    const proximo = { ...form, ...parcial }
    setForm(proximo)
    if (tentou) setErros(validarBloqueio(proximo))
  }

  function usarDiaInteiro() {
    const { inicio, fim } = janelaDoDia(form.dia === '' ? dia : form.dia)
    mudar({ inicio, fim })
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (salvando) return
    setErroServidor('')
    const encontrados = validarBloqueio(form)
    setTentou(true)
    setErros(encontrados)
    const primeiroErro = ORDEM_DOS_CAMPOS.find((c) => encontrados[c] !== undefined)
    if (primeiroErro) {
      campos.current.get(primeiroErro)?.focus()
      return
    }

    setSalvando(true)
    const resultado = await aoCriar(montarPedido(form))
    if (resultado.ok) {
      // Fecha pelo próprio <dialog>: o evento "close" avisa quem chama, que devolve o foco ao botão de abrir.
      dialogo.current?.close()
      return
    }
    setErroServidor(mensagemErroBloqueio(resultado.erro))
    voltarFocoAoBotao.current = true
    setSalvando(false)
  }

  const registrar = (campo: CampoBloqueio) => (el: HTMLElement | null) => {
    if (el) campos.current.set(campo, el)
    else campos.current.delete(campo)
  }
  const invalido = (campo: CampoBloqueio) => erros[campo] !== undefined
  const descricao = (campo: CampoBloqueio) => (erros[campo] ? `bloq-${campo}-erro` : undefined)
  const motivoLimpo = form.motivo.trim()
  const janela = janelaDoDia(form.dia === '' ? dia : form.dia)

  return (
    <DialogoPainel
      dialogoRef={dialogo}
      sobretitulo="Agenda"
      titulo="Bloquear horário"
      idTitulo="bloqueio-titulo"
      focoInicial={primeiroCampo}
      ocupado={salvando}
      aoFechar={aoFechar}
    >
      <form onSubmit={(e) => void enviar(e)} noValidate className="mt-6">
        <fieldset disabled={salvando} className="grid gap-5 border-0 p-0">
          <legend className="sr-only">Dados do bloqueio</legend>

          <Campo id="bloq-barbeiro" rotulo="Quem" erro={erros.barbeiro}>
            <select
              id="bloq-barbeiro"
              ref={(el) => {
                primeiroCampo.current = el
                registrar('barbeiro')(el)
              }}
              value={form.barbeiro}
              onChange={(e) => mudar({ barbeiro: e.target.value })}
              aria-invalid={invalido('barbeiro')}
              aria-describedby={descricao('barbeiro')}
              className={classeCampo}
            >
              <option value="" disabled>
                Escolha…
              </option>
              <option value={BARBEARIA_TODA}>Barbearia toda</option>
              {barbeiros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo id="bloq-dia" rotulo="Dia" erro={erros.dia}>
            <input
              id="bloq-dia"
              ref={registrar('dia')}
              type="date"
              min={hojeEmSP()}
              value={form.dia}
              onChange={(e) => mudar({ dia: e.target.value })}
              aria-invalid={invalido('dia')}
              aria-describedby={descricao('dia')}
              className={classeCampo}
            />
          </Campo>

          <div>
            <div className="grid grid-cols-2 gap-4">
              <Campo id="bloq-inicio" rotulo="Início" erro={erros.inicio}>
                <input
                  id="bloq-inicio"
                  ref={registrar('inicio')}
                  type="time"
                  step={900}
                  value={form.inicio}
                  onChange={(e) => mudar({ inicio: e.target.value })}
                  aria-invalid={invalido('inicio')}
                  aria-describedby={descricao('inicio')}
                  className={`${classeCampo} px-3`}
                />
              </Campo>
              <Campo id="bloq-fim" rotulo="Fim" erro={erros.fim}>
                <input
                  id="bloq-fim"
                  ref={registrar('fim')}
                  type="time"
                  step={900}
                  value={form.fim}
                  onChange={(e) => mudar({ fim: e.target.value })}
                  aria-invalid={invalido('fim')}
                  aria-describedby={descricao('fim')}
                  className={`${classeCampo} px-3`}
                />
              </Campo>
            </div>
            <button
              type="button"
              onClick={usarDiaInteiro}
              className={`${classeBotaoPequeno} mt-3 border-chumbo text-branco hover:border-branco`}
            >
              Dia inteiro · {janela.inicio} – {janela.fim}
            </button>
          </div>

          <Campo
            id="bloq-motivo"
            rotulo={
              <>
                Motivo <span className="font-normal text-chumbo normal-case tracking-normal">(opcional)</span>
              </>
            }
            erro={erros.motivo}
          >
            <input
              id="bloq-motivo"
              ref={registrar('motivo')}
              type="text"
              maxLength={MOTIVO_MAX}
              autoComplete="off"
              value={form.motivo}
              onChange={(e) => mudar({ motivo: e.target.value })}
              aria-invalid={invalido('motivo')}
              aria-describedby={descricao('motivo')}
              className={classeCampo}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div role="group" aria-label="Sugestões de motivo" className="flex flex-wrap gap-2">
                {MOTIVOS_RAPIDOS.map((m) => {
                  const marcado = motivoLimpo === m
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => mudar({ motivo: marcado ? '' : m })}
                      className={`${classeBotaoPequeno} ${
                        marcado
                          ? 'border-branco bg-branco text-preto'
                          : 'border-chumbo text-branco hover:border-branco'
                      }`}
                    >
                      {m}
                    </button>
                  )
                })}
              </div>
              <span aria-hidden="true" className="font-corpo text-sm text-chumbo">
                {form.motivo.length}/{MOTIVO_MAX}
              </span>
            </div>
          </Campo>
        </fieldset>

        {/* Rodapé fixo na base da folha: a folha rola por baixo e o botão (com o erro do servidor) fica sempre à vista, inclusive a 360px. */}
        <div className="sticky bottom-0 z-10 -mx-gutter mt-6 border-t border-cimento bg-asfalto px-gutter pt-4 pb-4 md:-mx-8 md:px-8">
          {erroServidor !== '' && (
            <p role="alert" className="mb-4 border-l-4 border-branco bg-concreto px-4 py-3 font-corpo text-base text-branco">
              {erroServidor}
            </p>
          )}
          <button
            ref={botao}
            type="submit"
            aria-disabled={salvando ? true : undefined}
            className="inline-flex min-h-12 w-full items-center justify-center bg-neon px-5 font-display text-2xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco aria-disabled:cursor-wait aria-disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Bloquear'}
          </button>
        </div>
      </form>
    </DialogoPainel>
  )
}
