import { describe, it, expect } from 'vitest'
import {
  MSG_CREDENCIAL,
  MSG_GENERICA,
  MSG_LIMITE,
  MSG_REDE,
  traduzirErroLogin,
  validarLogin,
} from '../../src/lib/painel/erroLogin'

describe('traduzirErroLogin', () => {
  it('credencial inválida, e-mail não confirmado e usuário inexistente dão a mesma frase', () => {
    const a = traduzirErroLogin({ code: 'invalid_credentials', status: 400 })
    const b = traduzirErroLogin({ code: 'email_not_confirmed', status: 400 })
    const c = traduzirErroLogin({ code: 'user_not_found', status: 400 })
    expect(a).toBe(MSG_CREDENCIAL)
    expect(b).toBe(MSG_CREDENCIAL)
    expect(c).toBe(MSG_CREDENCIAL)
  })

  it('reconhece a credencial inválida só pelo texto (servidor antigo)', () => {
    expect(traduzirErroLogin({ message: 'Invalid login credentials' })).toBe(MSG_CREDENCIAL)
  })

  it('a frase não revela se o e-mail existe', () => {
    expect(MSG_CREDENCIAL).toBe('E-mail ou senha incorretos.')
  })

  it('limite de tentativas', () => {
    expect(traduzirErroLogin({ code: 'over_request_rate_limit', status: 429 })).toBe(MSG_LIMITE)
    expect(traduzirErroLogin({ status: 429 })).toBe(MSG_LIMITE)
  })

  it('falha de rede', () => {
    expect(traduzirErroLogin({ name: 'AuthRetryableFetchError', status: 0 })).toBe(MSG_REDE)
    expect(traduzirErroLogin({ status: 0 })).toBe(MSG_REDE)
  })

  it('erro desconhecido cai na frase genérica', () => {
    expect(traduzirErroLogin({ status: 500, message: 'boom' })).toBe(MSG_GENERICA)
    expect(traduzirErroLogin({})).toBe(MSG_GENERICA)
  })
})

describe('validarLogin', () => {
  it('aceita e-mail e senha preenchidos', () => {
    expect(validarLogin('a@b.com', 'x')).toBeNull()
    expect(validarLogin('  a@b.com  ', 'x')).toBeNull()
  })

  it('pede o e-mail, depois a senha', () => {
    expect(validarLogin('', '')).toBe('Digite o e-mail.')
    expect(validarLogin('   ', 'abc')).toBe('Digite o e-mail.')
    expect(validarLogin('a@b.com', '')).toBe('Digite a senha.')
  })

  it('recusa e-mail malformado', () => {
    expect(validarLogin('sem-arroba', 'abc')).toBe('Digite um e-mail válido.')
    expect(validarLogin('a@b', 'abc')).toBe('Digite um e-mail válido.')
  })
})
