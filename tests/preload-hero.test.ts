import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HERO_CAMADAS } from '../src/data/hero.ts'

// O index.html faz preload do fundo do topo num script inline (só na rota "/"). O caminho repete o de
// src/data/hero.ts; este teste impede que fiquem desalinhados (preload de arquivo diferente = download à toa).
const html = readFileSync('index.html', 'utf8')

describe('preload do fundo do topo no index.html', () => {
  it('o script aponta para a mesma imagem de fundo usada pelo Hero', () => {
    expect(html).toContain(`l.href = '${HERO_CAMADAS.fundo}'`)
  })

  it('o script só vale em "/"', () => {
    expect(html).toContain("location.pathname === '/'")
  })

  it('as três camadas existem em public/', () => {
    for (const caminho of Object.values(HERO_CAMADAS)) expect(existsSync(`public${caminho}`), caminho).toBe(true)
  })
})
