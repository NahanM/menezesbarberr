import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Borda do campo do login (border-chumbo) precisa de pelo menos 3:1 (WCAG 1.4.11) sobre os fundos.
const css = readFileSync('src/styles/index.css', 'utf8')
const cor = (nome: string) => {
  const m = css.match(new RegExp(`--color-${nome}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token ${nome} não encontrado`)
  return m[1]
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const razao = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('contraste do login', () => {
  for (const fundo of ['preto', 'asfalto']) {
    it(`borda chumbo sobre ${fundo} >= 3:1`, () => {
      expect(razao(cor('chumbo'), cor(fundo))).toBeGreaterThanOrEqual(3)
    })
  }
  it('placeholder chumbo sobre o campo asfalto >= 4.5:1', () => {
    expect(razao(cor('chumbo'), cor('asfalto'))).toBeGreaterThanOrEqual(4.5)
  })
  it('texto neon sobre preto >= 4.5:1 (mensagem de erro)', () => {
    expect(razao(cor('neon'), cor('preto'))).toBeGreaterThanOrEqual(4.5)
  })
})
