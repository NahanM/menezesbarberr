import { describe, it, expect } from 'vitest'
import { normalizarErro, mensagemDeErro, type CodigoErro, type AcaoErro } from '../../src/lib/agendar/erros'

const esperado: Record<string, AcaoErro> = {
  URB01: 'recomecar',
  URB02: 'recomecar',
  URB03: 'corrigir-dados',
  URB04: 'corrigir-dados',
  URB05: 'voltar-horarios',
  URB06: 'chamar-whatsapp',
  URB07: 'voltar-horarios',
  URB08: 'tentar-de-novo',
  URB09: 'tentar-de-novo',
  URB16: 'recomecar',
  URB18: 'tentar-ou-whatsapp',
  URB20: 'tentar-ou-whatsapp',
}

describe('erros', () => {
  it.each(Object.entries(esperado))('%s via code e via message', (codigo, acao) => {
    for (const e of [{ code: codigo }, { message: `erro: ${codigo} falhou` }]) {
      const n = normalizarErro(e)
      expect(n.codigo).toBe(codigo)
      const m = mensagemDeErro(n)
      expect(m.acao).toBe(acao)
      expect(m.mensagem.length).toBeGreaterThan(5)
    }
  })
  it('URB18 (limite global): mensagem clara, com a saída pelo WhatsApp, e sem jargão', () => {
    const m = mensagemDeErro(normalizarErro({ code: 'URB18', message: 'Muitos pedidos agora. Tente em alguns minutos.' }))
    expect(m.mensagem).toBe('Muitos pedidos agora. Tente em alguns minutos ou chame no WhatsApp.')
    expect(m.acao).toBe('tentar-ou-whatsapp')
    expect(m.mensagem).not.toMatch(/URB|limite/i)
  })
  it('URB20 (honeypot): mensagem neutra, sem revelar a armadilha', () => {
    const m = mensagemDeErro(normalizarErro({ code: 'URB20', message: 'Não foi possível enviar agora.' }))
    expect(m.acao).toBe('tentar-ou-whatsapp')
    expect(m.mensagem).not.toMatch(/recarreg|URB|honeypot|website|robô|bot|campo/i)
  })
  it('rede', () => {
    for (const e of [new TypeError('Failed to fetch'), { message: 'Load failed' }, { message: 'NetworkError when attempting' }]) {
      expect(normalizarErro(e).codigo).toBe('REDE')
    }
    expect(mensagemDeErro({ codigo: 'REDE' }).acao).toBe('tentar-de-novo')
  })
  it('conexão que travou (limite de espera estourado) conta como rede', () => {
    for (const e of [{ message: 'Error: timeout' }, { message: 'TimeoutError: signal timed out' }, { message: 'AbortError: The operation was aborted' }]) {
      expect(normalizarErro(e).codigo).toBe('REDE')
    }
  })
  it('desconhecido', () => {
    for (const e of [null, undefined, 'URB05', 42, {}, { code: '23505' }, { code: 'URB10' }, { code: 'URB17' }, { message: 'URB19' }, { message: 'URB00' }, new Error('boom')]) {
      expect(normalizarErro(e).codigo).toBe('DESCONHECIDO')
    }
  })
  it('mensagens não vazam jargão técnico', () => {
    const todos: CodigoErro[] = [
      'URB01', 'URB02', 'URB03', 'URB04', 'URB05', 'URB06', 'URB07', 'URB08', 'URB09', 'URB16', 'URB18', 'URB20', 'REDE', 'DESCONHECIDO',
    ]
    for (const c of todos) expect(mensagemDeErro({ codigo: c }).mensagem).not.toMatch(/URB0|sql|postgres/i)
  })
})
