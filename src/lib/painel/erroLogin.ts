// Traduz o erro do signInWithPassword em uma frase curta em português.
// Regra de segurança: e-mail inexistente, senha errada e e-mail não confirmado devolvem a
// MESMA frase, para a tela não revelar quais e-mails têm conta.

/** Só o que lemos do erro do Supabase Auth (aceita o AuthError sem importar o tipo). */
export interface ErroAuthLike {
  name?: string
  message?: string
  status?: number
  code?: string
}

export const MSG_CREDENCIAL = 'E-mail ou senha incorretos.'
export const MSG_REDE = 'Sem conexão. Confira a internet e tente de novo.'
export const MSG_LIMITE = 'Muitas tentativas. Espere um pouco e tente de novo.'
export const MSG_GENERICA = 'Não foi possível entrar. Tente de novo.'

const CODIGOS_CREDENCIAL = ['invalid_credentials', 'email_not_confirmed', 'user_not_found']

export function traduzirErroLogin(erro: ErroAuthLike): string {
  if (erro.code && CODIGOS_CREDENCIAL.includes(erro.code)) return MSG_CREDENCIAL
  if (erro.code === 'over_request_rate_limit' || erro.status === 429) return MSG_LIMITE
  // Falha de rede: o supabase-js usa AuthRetryableFetchError (status 0 ou sem status).
  if (erro.name === 'AuthRetryableFetchError' || erro.status === 0) return MSG_REDE
  // Versões antigas do servidor só mandam o texto.
  if (/invalid login credentials/i.test(erro.message ?? '')) return MSG_CREDENCIAL
  if (erro.status === 400 || erro.status === 401 || erro.status === 422) return MSG_CREDENCIAL
  return MSG_GENERICA
}

/** Confere os campos antes de chamar o servidor. null = pode enviar. */
export function validarLogin(email: string, senha: string): string | null {
  if (email.trim() === '') return 'Digite o e-mail.'
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Digite um e-mail válido.'
  if (senha === '') return 'Digite a senha.'
  return null
}
