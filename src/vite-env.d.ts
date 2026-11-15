/// <reference types="vite/client" />

// Tipos das variáveis de ambiente que o front lê (só as públicas, prefixo VITE_).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
