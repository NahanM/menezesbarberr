import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FOTOS } from '../src/data/fotos.gerado.ts'

describe('fotos.gerado', () => {
  for (const [nome, info] of Object.entries(FOTOS) as [string, { larguras: number[]; semSufixo?: boolean }][]) {
    it(`${nome}: arquivos existem em public/`, () => {
      const arqs = info.semSufixo ? [`${nome}.webp`] : info.larguras.map((l) => `${nome}-${l}.webp`)
      for (const a of arqs) expect(existsSync(`public/assets/fotos/${a}`), a).toBe(true)
    })
  }
})
