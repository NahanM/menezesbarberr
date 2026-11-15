import { useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase.ts'
import { MSG_REDE, traduzirErroLogin, validarLogin } from '../../lib/painel/erroLogin.ts'
import Foto from '../Foto.tsx'
import Logo from '../Logo.tsx'
import Listras from '../grafico/Listras.tsx'
import PalavraVazada from '../grafico/PalavraVazada.tsx'

const classeCampo =
  'block min-h-12 w-full border-2 border-chumbo bg-asfalto px-4 font-corpo text-lg text-branco placeholder:text-chumbo focus:border-neon aria-invalid:border-neon'
const classeRotulo = 'mb-2 block font-corpo text-sm font-semibold tracking-widest text-cinza-claro uppercase'

// Onde a diagonal do recorte da foto termina embaixo (% da largura; em cima ela vai até 100%).
// O clip-path e a linha neon usam este mesmo número, para a linha acompanhar a borda.
const DIAGONAL_BASE = 68

// Login da equipe. Sem animação da landing: tela de trabalho, direta.
export default function TelaLogin() {
  const emailRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  // Qual campo marcar como inválido: validação marca o que falhou; erro do servidor, só a senha.
  const [campoComErro, setCampoComErro] = useState<'email' | 'senha' | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    const invalido = validarLogin(email, senha)
    if (invalido) {
      const campo = email.trim() !== '' && validarLogin(email, 'x') === null ? 'senha' : 'email'
      setErro(invalido)
      setCampoComErro(campo)
      ;(campo === 'senha' ? senhaRef : emailRef).current?.focus()
      return
    }
    setErro('')
    setCampoComErro(null)
    setEnviando(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) {
        setErro(traduzirErroLogin(error))
        setCampoComErro('senha')
        setEnviando(false)
        senhaRef.current?.focus()
      }
      // Sucesso: o onAuthStateChange troca a tela. O botão fica em "Entrando" até lá.
    } catch {
      setErro(MSG_REDE)
      setCampoComErro(null)
      setEnviando(false)
    }
  }

  return (
    <main id="conteudo" className="relative grid min-h-dvh overflow-hidden bg-preto md:grid-cols-[1fr_minmax(26rem,32rem)]">
      {/* Lado esquerdo (só desktop): foto P&B recortada na diagonal das listras, com a palavra vazada por cima.
          A foto é decorativa: alt vazio, prioridade baixa (o login vem primeiro) e lazy (no celular o bloco
          fica com display:none, então o navegador nem baixa). Sem animação: é tela de trabalho. */}
      <div className="relative hidden items-end justify-start p-gutter md:flex">
        <div className="grao absolute inset-0 bg-concreto" style={{ clipPath: `polygon(0 0, 100% 0, ${DIAGONAL_BASE}% 100%, 0 100%)` }}>
          <Foto
            nome="salao"
            alt=""
            sizes="(min-width: 768px) 60vw, 1px"
            baixaPrioridade
            foco={{ celular: '55% 50%', desktop: '55% 50%' }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-preto/80 via-transparent to-transparent" />
        </div>
        {/* Linha fina em neon na borda do recorte (mesma diagonal do clip-path) */}
        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <line x1="100" y1="0" x2={DIAGONAL_BASE} y2="100" stroke="var(--color-neon)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <PalavraVazada texto="Barber’s" vertical className="relative text-display-lg text-branco" />
        <Listras className="absolute inset-x-0 top-0 h-6 text-neon" />
      </div>

      <div className="flex flex-col justify-center px-gutter py-secao">
        <Logo className="mb-8 h-14" />
        <p className="font-corpo text-sm tracking-widest text-neon uppercase">Equipe Menezes</p>
        <h1 className="mt-2 text-display-md">Painel</h1>
        <p className="mt-3 max-w-prose">Entre com o e-mail e a senha da equipe.</p>

        <form onSubmit={(e) => void enviar(e)} noValidate className="mt-8 max-w-md">
          <div>
            <label htmlFor="painel-email" className={classeRotulo}>
              E-mail
            </label>
            <input
              ref={emailRef}
              id="painel-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={enviando}
              aria-invalid={campoComErro === 'email'}
              aria-describedby="painel-erro"
              className={classeCampo}
            />
          </div>
          <div className="mt-5">
            <label htmlFor="painel-senha" className={classeRotulo}>
              Senha
            </label>
            <input
              ref={senhaRef}
              id="painel-senha"
              name="password"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              readOnly={enviando}
              aria-invalid={campoComErro === 'senha'}
              aria-describedby="painel-erro"
              className={classeCampo}
            />
          </div>

          {/* Região sempre presente: o leitor de tela anuncia o texto quando ele aparece. */}
          <p
            id="painel-erro"
            role="alert"
            className="mt-4 min-h-7 font-display text-xl tracking-wider text-neon uppercase"
          >
            {erro}
          </p>

          <button
            type="submit"
            disabled={enviando}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center bg-neon px-5 font-display text-2xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco disabled:cursor-wait disabled:bg-cimento disabled:text-chumbo"
          >
            {enviando ? 'Entrando' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
