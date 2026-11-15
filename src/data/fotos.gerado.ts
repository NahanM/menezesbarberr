// Manifesto das fotos de public/assets/fotos. Mantido à mão enquanto só existe uma foto real do salão
// (na Menezes era gerado por script). Para acrescentar uma foto: salve os WebP como <nome>-<largura>.webp
// em public/assets/fotos e some uma linha aqui. tests/fotos-gerado.test.ts confere se os arquivos existem.
export interface InfoFoto {
  /** Largura e altura da foto original (define a proporção, evita salto de layout). */
  largura: number
  altura: number
  /** Larguras dos arquivos WebP: public/assets/fotos/<nome>-<largura>.webp */
  larguras: number[]
  /** Arquivo único sem sufixo de largura. */
  semSufixo?: boolean
}

export const FOTOS = {
  // Foto real do salão (página da barbearia no AppBarber). TODO: pedir fotos em alta ao dono.
  salao: { largura: 800, altura: 446, larguras: [480, 800] },
} satisfies Record<string, InfoFoto>

export type NomeFoto = keyof typeof FOTOS
