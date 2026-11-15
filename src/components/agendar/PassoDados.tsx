import { useEffect, useRef, useState, type FormEvent } from 'react'
import PassoLayout from './PassoLayout.tsx'
import {
  mascararTelefone,
  validarNome,
  validarTelefone,
  type CampoDados,
  type DadosCliente,
} from '../../lib/agendar/dados.ts'

export const ID_FORM_DADOS = 'form-dados'

interface Props {
  dados: DadosCliente
  /** Honeypot: valor do campo invisível (name url_empresa; vai à RPC como p_website). */
  website: string
  aoMudarWebsite: (valor: string) => void
  aoMudar: (dados: DadosCliente) => void
  /** Chamado quando os dois campos estão válidos. */
  aoValidar: () => void
  /** Erro que veio do servidor (URB03/URB04): marca o campo e mostra a mensagem. */
  erroServidor: { campo: CampoDados; mensagem: string } | null
}

const classeCampo = (invalido: boolean) =>
  `block min-h-12 w-full border-2 bg-asfalto px-4 font-corpo text-lg text-branco placeholder:text-chumbo ${
    invalido ? 'border-neon' : 'border-cimento focus:border-chumbo'
  }`

// Erro de validação: caixa alta condensada com prefixo, para não parecer dica nem foco.
const classeErro = 'mt-2 font-display text-xl tracking-wider text-neon uppercase'

// Listras finas "////" na borda esquerda do campo inválido (decorativa; o erro também vem em texto).
function MarcaErro() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-3 text-neon"
      style={{
        backgroundImage:
          'repeating-linear-gradient(calc(90deg + var(--angulo-listra)), currentColor 0 3px, transparent 3px 7px)',
      }}
    />
  )
}

// Passo 4. Dois campos. Erros aparecem depois que a pessoa sai do campo ou tenta continuar,
// ligados ao campo por aria-describedby (o leitor de tela lê o erro junto com o rótulo).
export default function PassoDados({
  dados,
  website,
  aoMudarWebsite,
  aoMudar,
  aoValidar,
  erroServidor,
}: Props) {
  const nomeRef = useRef<HTMLInputElement>(null)
  const telefoneRef = useRef<HTMLInputElement>(null)
  const [tocados, setTocados] = useState<Record<CampoDados, boolean>>({
    nome: false,
    telefone: false,
  })

  // Voltou do servidor com erro num campo: leva o foco até ele.
  const campoDoErro = erroServidor?.campo
  useEffect(() => {
    if (campoDoErro === 'nome') nomeRef.current?.focus()
    if (campoDoErro === 'telefone') telefoneRef.current?.focus()
  }, [campoDoErro])

  const erroNome =
    (tocados.nome ? validarNome(dados.nome) : null) ??
    (erroServidor?.campo === 'nome' ? erroServidor.mensagem : null)
  const erroTelefone =
    (tocados.telefone ? validarTelefone(dados.telefone) : null) ??
    (erroServidor?.campo === 'telefone' ? erroServidor.mensagem : null)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTocados({ nome: true, telefone: true })
    if (validarNome(dados.nome) !== null) return nomeRef.current?.focus()
    if (validarTelefone(dados.telefone) !== null) return telefoneRef.current?.focus()
    aoValidar()
  }

  return (
    <PassoLayout
      numero={4}
      titulo="Seus dados"
      ajuda="Só nome e WhatsApp. A barbearia confirma o horário por lá."
    >
      <form
        id={ID_FORM_DADOS}
        onSubmit={enviar}
        noValidate
        className="flex max-w-xl flex-col gap-8"
      >
        <div>
          <label
            htmlFor="campo-nome"
            className="font-corpo text-sm tracking-widest text-neon uppercase"
          >
            Nome
          </label>
          <div className="relative mt-2">
            <input
              ref={nomeRef}
              id="campo-nome"
              name="nome"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={dados.nome}
              onChange={(e) => aoMudar({ ...dados, nome: e.target.value })}
              onBlur={() => setTocados((t) => ({ ...t, nome: true }))}
              aria-invalid={erroNome !== null}
              aria-describedby={erroNome !== null ? 'erro-nome' : undefined}
              placeholder="Como te chamamos"
              className={classeCampo(erroNome !== null)}
            />
            {erroNome !== null && <MarcaErro />}
          </div>
          {erroNome !== null && (
            <p id="erro-nome" className={classeErro}>
              <span aria-hidden="true">Erro · </span>
              {erroNome}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="campo-telefone"
            className="font-corpo text-sm tracking-widest text-neon uppercase"
          >
            WhatsApp
          </label>
          <div className="relative mt-2">
            <input
              ref={telefoneRef}
              id="campo-telefone"
              name="telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={dados.telefone}
              onChange={(e) =>
                aoMudar({
                  ...dados,
                  telefone: mascararTelefone(e.target.value),
                })
              }
              onBlur={() => setTocados((t) => ({ ...t, telefone: true }))}
              aria-invalid={erroTelefone !== null}
              aria-describedby={`dica-telefone${erroTelefone !== null ? ' erro-telefone' : ''}`}
              placeholder="(11) 99999-9999"
              className={classeCampo(erroTelefone !== null)}
            />
            {erroTelefone !== null && <MarcaErro />}
          </div>
          <p id="dica-telefone" className="mt-2 font-corpo text-sm text-chumbo">
            Com DDD. Usamos só para confirmar seu horário.
          </p>
          {erroTelefone !== null && (
            <p id="erro-telefone" className={classeErro}>
              <span aria-hidden="true">Erro · </span>
              {erroTelefone}
            </p>
          )}
        </div>

        {/* Honeypot: campo-armadilha para robô de formulário. Nome e id sem
            semântica de autofill (nada de "website", "url", "email"), para o navegador não preencher. Fica fora da tela (não display:none,
            que robô costuma pular), fora do Tab e escondido do leitor de tela. Pessoa nunca o vê. O
            valor vai ao servidor, que recusa se vier preenchido. Não entra no rascunho. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
        >
          <label htmlFor="url_empresa">Deixe em branco</label>
          <input
            id="url_empresa"
            name="url_empresa"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => aoMudarWebsite(e.target.value)}
          />
        </div>
      </form>
    </PassoLayout>
  )
}
