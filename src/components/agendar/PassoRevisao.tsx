import { useEffect, useRef, type ReactNode } from 'react'
import PassoLayout from './PassoLayout.tsx'
import { contato } from '../../data/barbearia.ts'
import type { AcaoErro } from '../../lib/agendar/erros.ts'
import { linkWhatsApp } from '../../lib/whatsapp.ts'

interface Linha {
  rotulo: string
  valor: ReactNode
  /** Texto pequeno abaixo do valor. */
  nota?: string
  /** Passo para onde o botão "Editar" leva; sem isso, a linha não é editável. */
  passoEditar?: number
}

interface Props {
  linhas: Linha[]
  preco: string
  aoEditar: (passo: number) => void
  /** Erro da última tentativa de confirmar (null = nenhum). */
  erro: { mensagem: string; acao: AcaoErro } | null
  aoRecomecar: () => void
  /** Repete o envio (erro de rede ou do servidor). Os dados continuam preenchidos. */
  aoTentarDeNovo: () => void
  /** Envio em andamento: os botões "Editar" ficam desabilitados. */
  enviando: boolean
  /** O envio passou do limite (ENVIO_DEMORANDO_MS): avisa e oferece o WhatsApp. O envio segue em andamento. */
  demorando: boolean
}

const botaoTexto =
  'inline-flex min-h-11 items-center border-b border-neon font-display text-2xl tracking-wider text-branco uppercase transition-colors duration-rapida hover:text-neon'

// Passo 5. Tudo o que vai ser gravado, com "Editar" em cada item. O botão Confirmar fica na
// barra de baixo (BarraAcao), que a página controla.
export default function PassoRevisao({
  linhas,
  preco,
  aoEditar,
  erro,
  aoRecomecar,
  aoTentarDeNovo,
  enviando,
  demorando,
}: Props) {
  const avisoRef = useRef<HTMLDivElement>(null)
  const erroRef = useRef<HTMLDivElement>(null)

  // O aviso de demora e o erro nascem perto do pé da tela, onde fica a barra fixa. 'nearest' só rola
  // se a caixa não estiver inteira à vista, e o scroll-mb-40 da caixa deixa a folga da barra.
  // Rolagem instantânea: sem animação, vale também com prefers-reduced-motion.
  useEffect(() => {
    if (demorando) avisoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [demorando])
  useEffect(() => {
    if (erro === null) return
    // O foco já faz o leitor de tela ler o grupo (nome = a mensagem); por isso não é role="alert",
    // que anunciaria o erro uma segunda vez.
    erroRef.current?.focus({ preventScroll: true })
    erroRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [erro])

  return (
    <PassoLayout
      numero={5}
      titulo="Confere aí"
      ajuda="Estando certo, confirma. O horário já fica reservado."
    >
      <dl className="border-t border-cimento">
        {linhas.map((l) => (
          // Dentro de <dl>, o <div> só pode ter <dt> e <dd> como filhos diretos: o botão Editar vai num <dd>.
          <div
            key={l.rotulo}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-b border-cimento py-4"
          >
            <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">
              {l.rotulo}
            </dt>
            <dd className="col-start-1 mt-1 font-display text-2xl tracking-wide break-words text-branco uppercase">
              {l.valor}
            </dd>
            {l.nota !== undefined && (
              <dd className="col-start-1 mt-1 font-corpo text-sm text-cinza-claro">{l.nota}</dd>
            )}
            {l.passoEditar !== undefined && (
              <dd className="col-start-2 row-span-3 row-start-1">
                <button
                  type="button"
                  onClick={() => aoEditar(l.passoEditar!)}
                  disabled={enviando}
                  aria-label={`Editar ${l.rotulo.toLowerCase()}`}
                  className="inline-flex min-h-11 shrink-0 items-center font-corpo text-sm tracking-widest text-cinza-claro uppercase underline decoration-neon underline-offset-4 enabled:hover:text-branco disabled:opacity-40"
                >
                  Editar
                </button>
              </dd>
            )}
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 py-4">
          <dt className="font-corpo text-sm tracking-widest text-chumbo uppercase">Valor</dt>
          <dd className="font-display text-5xl leading-none text-neon">{preco}</dd>
        </div>
      </dl>

      {/* Região sempre montada: o leitor de tela anuncia o envio em andamento e, depois, a demora. */}
      <div role="status">
        <p className="sr-only">{enviando ? 'Enviando seu agendamento.' : ''}</p>
        {demorando && (
          <div ref={avisoRef} className="mt-6 scroll-mb-40 border-2 border-cimento bg-asfalto p-6">
            <p className="font-corpo text-lg text-branco">
              Ainda enviando. Se demorar, confira no WhatsApp.
            </p>
            <a
              href={linkWhatsApp(contato.whatsapp, 'Olá, pessoal da Menezes! Pedi um horário pelo site e a tela demorou. Podem conferir?')}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-4 ${botaoTexto}`}
            >
              Chamar no WhatsApp
            </a>
          </div>
        )}
      </div>

      {erro !== null && (
        <div
          ref={erroRef}
          role="group"
          aria-labelledby="erro-confirmar-msg"
          tabIndex={-1}
          className="mt-6 scroll-mb-40 border-2 border-neon bg-asfalto p-6 outline-offset-4"
        >
          <p id="erro-confirmar-msg" className="font-corpo text-lg text-branco">
            {erro.mensagem}
          </p>
          {(erro.acao === 'chamar-whatsapp' || erro.acao === 'tentar-ou-whatsapp') && (
            <a
              href={linkWhatsApp(contato.whatsapp, 'Olá, pessoal da Menezes! Quero agendar um horário.')}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-4 ${botaoTexto}`}
            >
              Chamar no WhatsApp
            </a>
          )}
          {erro.acao === 'recomecar' && (
            <button type="button" onClick={aoRecomecar} className={`mt-4 ${botaoTexto}`}>
              Escolher de novo
            </button>
          )}
          {(erro.acao === 'tentar-de-novo' || erro.acao === 'tentar-ou-whatsapp') && (
            <>
              <p className="mt-2 font-corpo text-sm text-cinza-claro">Seus dados continuam aqui.</p>
              <button
                type="button"
                onClick={aoTentarDeNovo}
                disabled={enviando}
                className={`mt-4 ${botaoTexto} disabled:opacity-40`}
              >
                {enviando ? 'Enviando' : 'Tentar de novo'}
              </button>
            </>
          )}
        </div>
      )}
    </PassoLayout>
  )
}
