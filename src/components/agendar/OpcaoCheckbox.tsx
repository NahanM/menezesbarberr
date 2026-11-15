import type { ReactNode } from 'react'

interface Props {
  valor: string
  marcado: boolean
  aoAlternar: (valor: string) => void
  desabilitado?: boolean
  /** id do texto que explica a regra do grupo (aria-describedby). */
  descritoPor?: string
  className?: string
  children: ReactNode
}

// Uma opção que se liga e desliga (vários podem ficar marcados). Por baixo é um
// <input type="checkbox"> de verdade, escondido só visualmente: teclado (Espaço) e leitor de tela
// funcionam sem código extra. Mesma aparência de foco da OpcaoRadio.
export default function OpcaoCheckbox({
  valor,
  marcado,
  aoAlternar,
  desabilitado = false,
  descritoPor,
  className = '',
  children,
}: Props) {
  return (
    <label
      className={`relative block has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-neon ${
        desabilitado ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        type="checkbox"
        value={valor}
        checked={marcado}
        disabled={desabilitado}
        aria-describedby={descritoPor}
        onChange={() => aoAlternar(valor)}
        // Margens de rolagem: ao focar pelo teclado, a opção não fica sob o cabeçalho fixo (4rem) nem sob a barra de ação do rodapé.
        className="sr-only scroll-mt-24 scroll-mb-40"
      />
      {children}
    </label>
  )
}
