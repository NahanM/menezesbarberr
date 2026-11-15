import type { CSSProperties, Ref } from 'react'
import { FOTOS, type NomeFoto } from '../data/fotos.gerado.ts'

/** Ponto de foco do enquadramento (object-position do CSS): um para o celular e outro para o desktop (a partir de 768px). */
export interface Foco {
  celular: string
  desktop: string
}

interface Props {
  /** Nome da foto no manifesto (src/data/fotos.gerado.ts, gerado por scripts/preparar-fotos.mjs). */
  nome: NomeFoto
  alt: string
  /**
   * Largura que a foto ocupa na tela, como o atributo `sizes` do HTML (ex.: "(min-width: 768px) 33vw, 100vw").
   * É o que deixa o navegador escolher o arquivo certo do srcset: celular baixa o pequeno.
   */
  sizes: string
  /** Só a foto do hero: carrega já E com fetchpriority="high" (é a maior da primeira tela). */
  prioridade?: boolean
  /** Outras fotos que já aparecem na primeira tela (ex.: páginas de sucesso): carregam já, sem lazy. */
  imediata?: boolean
  /** Foto decorativa que não pode competir com o conteúdo (ex.: fundo da tela de login): fetchpriority="low". */
  baixaPrioridade?: boolean
  /** Foco do enquadramento: rosto e corte de cabelo precisam aparecer nas duas larguras. */
  foco?: Foco
  className?: string
  ref?: Ref<HTMLImageElement>
}

const FOCO_CENTRO: Foco = { celular: 'center', desktop: 'center' }

// Único lugar do site que escreve a tag <img> de uma foto. Cuida de:
// - srcset/sizes: o navegador escolhe a largura certa entre os WebP gerados;
// - width/height: reservam a proporção antes do arquivo chegar (sem salto de layout);
// - foco: duas variáveis CSS (celular e desktop) que a classe .foco-foto escolhe no breakpoint md (ver styles/index.css);
// - lazy + decoding async fora da primeira tela; fetchpriority="high" só na foto do hero.
export default function Foto({ nome, alt, sizes, prioridade = false, imediata = false, baixaPrioridade = false, foco = FOCO_CENTRO, className = '', ref }: Props) {
  const info: (typeof FOTOS)[NomeFoto] = FOTOS[nome]
  const maior = info.larguras[info.larguras.length - 1]
  const semSufixo = 'semSufixo' in info
  const src = semSufixo ? `/assets/fotos/${nome}.webp` : `/assets/fotos/${nome}-${maior}.webp`
  const srcSet = semSufixo
    ? undefined
    : info.larguras.map((l) => `/assets/fotos/${nome}-${l}.webp ${l}w`).join(', ')

  return (
    <img
      ref={ref}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={info.largura}
      height={info.altura}
      alt={alt}
      loading={prioridade || imediata ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={prioridade ? 'high' : baixaPrioridade ? 'low' : undefined}
      style={{ '--foco-celular': foco.celular, '--foco-desktop': foco.desktop } as CSSProperties}
      className={`foco-foto ${className}`}
    />
  )
}
