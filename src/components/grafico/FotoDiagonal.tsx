import { useRef } from 'react'
import { useRevelarAoEntrar } from '../../hooks/useRevelarAoEntrar.ts'
import type { NomeFoto } from '../../data/fotos.gerado.ts'
import Foto, { type Foco } from '../Foto.tsx'

interface Props {
  /** Nome da foto no manifesto (src/data/fotos.gerado.ts). */
  nome: NomeFoto
  alt: string
  /** Largura da foto na tela (atributo sizes), para o navegador escolher o arquivo do srcset. */
  sizes: string
  /** Tamanho da caixa (largura e altura ou aspect-ratio). A foto cobre a caixa toda. */
  className?: string
  /** Foco do enquadramento (celular e desktop). */
  foco?: Foco
  /** Só a foto do hero: carrega já e com fetchpriority="high". */
  prioridade?: boolean
  /** Foto que já aparece na primeira tela: carrega já, sem lazy-load. */
  imediata?: boolean
}

// Revela a foto com um corte diagonal no ângulo das listras (token --angulo-listra),
// com um leve zoom-out junto. O estado final é a foto inteira.
function revelarDiagonal(foto: HTMLElement): Keyframe[] {
  const graus = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--angulo-listra'),
  )
  const angulo = Number.isFinite(graus) ? graus : 18
  // Quanto a borda inclinada avança na horizontal ao longo da altura da foto.
  const deslocamento = Math.ceil((foto.clientHeight || window.innerHeight) * Math.tan((angulo * Math.PI) / 180))
  return [
    {
      clipPath: `polygon(0px 0px, 0px 0px, -${deslocamento}px 100%, 0px 100%)`,
      transform: 'scale(1.12)',
    },
    {
      clipPath: `polygon(0px 0px, calc(100% + ${deslocamento}px) 0px, 100% 100%, 0px 100%)`,
      transform: 'scale(1)',
    },
  ]
}

// Foto P&B revelada por recorte diagonal ao entrar na tela. A caixa de fora fica parada
// (o observador vigia ela); só a imagem anima.
export default function FotoDiagonal({
  nome,
  alt,
  sizes,
  className = '',
  foco,
  prioridade = false,
  imediata = false,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const foto = useRef<HTMLImageElement>(null)
  useRevelarAoEntrar(foto, caixa, revelarDiagonal)

  return (
    <div ref={caixa} className={`grao relative overflow-hidden bg-concreto ${className}`}>
      <Foto
        ref={foto}
        nome={nome}
        alt={alt}
        sizes={sizes}
        prioridade={prioridade}
        imediata={imediata}
        foco={foco}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  )
}
