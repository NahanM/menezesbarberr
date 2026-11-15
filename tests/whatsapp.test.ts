import { describe, expect, it } from 'vitest'
import { linkWhatsApp } from '../src/lib/whatsapp.ts'

describe('linkWhatsApp', () => {
  it('usa só os dígitos do número', () => {
    expect(linkWhatsApp('+55 (11) 99999-0000')).toBe('https://wa.me/5511999990000')
  })

  it('sem texto não coloca ?text', () => {
    expect(linkWhatsApp('5511999990000')).not.toContain('?')
    expect(linkWhatsApp('5511999990000', '')).not.toContain('?')
  })

  it('codifica acentos, & # ? e quebra de linha', () => {
    const texto = 'Olá, pessoal da Menezes! Corte & barba #1?\nNome: João'
    const url = linkWhatsApp('5511999990000', texto)
    const query = url.split('?text=')[1]
    expect(query).not.toMatch(/[&#?\n ]/)
    expect(query).toContain('%26')
    expect(query).toContain('%23')
    expect(query).toContain('%3F')
    expect(query).toContain('%0A')
    expect(query).toContain('Ol%C3%A1')
    expect(decodeURIComponent(query)).toBe(texto)
  })

  it('a URL tem um único "?"', () => {
    expect(linkWhatsApp('55119', 'a?b?c').split('?')).toHaveLength(2)
  })
})
