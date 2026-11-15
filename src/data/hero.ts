// Camadas do topo da landing (public/assets/hero), todas com o mesmo tamanho para empilharem sem ajuste.
// O index.html faz preload do fundo num script inline (só na rota "/"); tests/preload-hero.test.ts
// confere que o caminho de lá é o mesmo daqui.
export const HERO_CAMADAS = {
  fundo: '/assets/hero/fundo.webp',
  meio: '/assets/hero/meio.webp',
  frente: '/assets/hero/frente.webp',
} as const

export const HERO_LARGURA = 2560
export const HERO_ALTURA = 1429
