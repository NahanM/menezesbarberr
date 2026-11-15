import { describe, it, expect } from 'vitest'
import { mensagemWhatsApp, linkConfirmacao } from '../../src/lib/agendar/mensagem'
import { contato } from '../../src/data/barbearia'

const d = {
  servico: 'Cuidado Completo',
  barbeiro: 'Rafael',
  inicio: '2026-10-14T17:30:00+00:00',
  nome: 'João & Maria "Ç" ã',
  codigo: 'K7MQ2X',
}

describe('mensagem', () => {
  it('string exata do template (14:30 SP, quarta 14/10)', () => {
    expect(mensagemWhatsApp(d)).toBe(
      'Olá, pessoal da Menezes! Quero confirmar meu horário: Cuidado Completo com Rafael, quarta 14/10 às 14:30. Nome: João & Maria "Ç" ã. Código: K7MQ2X.',
    )
  })
  it('usa fuso de SP perto da meia-noite', () => {
    expect(mensagemWhatsApp({ ...d, inicio: '2026-10-10T02:30:00Z' })).toContain('sexta 09/10 às 23:30')
  })
  it('link decodificado reproduz a mensagem; número só dígitos', () => {
    const link = linkConfirmacao(d)
    const [base, query] = link.split('?text=')
    expect(base).toBe(`https://wa.me/${contato.whatsapp.replace(/\D/g, '')}`)
    expect(base).toMatch(/^https:\/\/wa\.me\/\d+$/)
    expect(decodeURIComponent(query)).toBe(mensagemWhatsApp(d))
    expect(query).not.toMatch(/[ &"]/)
    expect(new URL(link).searchParams.get('text')).toBe(mensagemWhatsApp(d))
  })
})
