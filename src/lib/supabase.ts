import { createClient } from '@supabase/supabase-js'
import type { Database } from './supabase.types.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const chavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !chavePublica) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY. Copie .env.example para .env e preencha.',
  )
}

// Só a chave pública (publishable) entra no front. A segurança real fica no RLS do banco.
// O <Database> faz o TypeScript conferir as chamadas de supabase.rpc(...).
export const supabase = createClient<Database>(url, chavePublica)
