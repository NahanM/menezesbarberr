import type { ReactNode } from 'react'

interface Props {
  /** Todas as opções do mesmo grupo usam o mesmo `nome`: é isso que liga as setas do teclado. */
  nome: string
  valor: string
  selecionado: boolean
  aoEscolher: (valor: string) => void
  desabilitado?: boolean
  /** Classes do <label> (largura, posição...). A aparência de "escolhido" fica com quem usa. */
  className?: string
  children: ReactNode
}

// Uma opção de escolha única. Por baixo é um <input type="radio"> de verdade (escondido só
// visualmente com sr-only), então teclado, leitor de tela e "grupo de rádio" funcionam sem código extra.
// O <label> inteiro é a área de toque. O anel de foco aparece no label quando o rádio recebe foco pelo teclado.
export default function OpcaoRadio({
  nome,
  valor,
  selecionado,
  aoEscolher,
  desabilitado = false,
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
        type="radio"
        name={nome}
        value={valor}
        checked={selecionado}
        disabled={desabilitado}
        onChange={() => aoEscolher(valor)}
        // Margens de rolagem: ao focar pelo teclado, a opção não fica sob o cabeçalho fixo (4rem) nem sob a barra de ação do rodapé.
        className="sr-only scroll-mt-24 scroll-mb-40"
      />
      {children}
    </label>
  )
}
