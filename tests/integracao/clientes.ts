import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const url = process.env.VITE_SUPABASE_URL
export const chave = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const email = process.env.E2E_EMAIL
export const senha = process.env.E2E_SENHA

export const temEnvAnon = Boolean(url && chave)
export const temEnvEquipe = Boolean(url && chave && email && senha)

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }

/** Cliente visitante, só com a chave pública. */
export function clienteAnon(): SupabaseClient {
  return createClient(url!, chave!, opcoes)
}

/** Cliente logado com E2E_EMAIL/E2E_SENHA (membro da equipe). */
export async function clienteEquipe(): Promise<SupabaseClient> {
  const c = createClient(url!, chave!, opcoes)
  const { error } = await c.auth.signInWithPassword({ email: email!, password: senha! })
  if (error) throw new Error(`Login da equipe falhou: ${error.message}`)
  return c
}

/** Teto "sem limite" para as criações de preparação dos testes (a função de teste exige um número). */
const SEM_LIMITE = 1_000_000

/**
 * Cria um agendamento como a equipe, pelo caminho de teste (teste_criar_agendamento).
 * Mesmas regras de horário, serviço, barbeiro, telefone e conflito da função pública (é o mesmo corpo),
 * mas a linha criada NÃO conta no limite global de criações (URB18). Serve para os testes de
 * preparação: o limite de produção é pequeno (10 por minuto, 30 por hora) e várias suítes rodam juntas.
 * Exige nome começando com "Teste". Só a criação pelo caminho público (anon) conta no limite.
 */
export function criarComoTeste(
  equipe: SupabaseClient,
  args: { p_servicos: string[]; p_barbeiro: string | null; p_inicio: string; p_nome: string; p_telefone: string },
) {
  return equipe.rpc('teste_criar_agendamento', { ...args, p_max_minuto: SEM_LIMITE, p_max_hora: SEM_LIMITE })
}
