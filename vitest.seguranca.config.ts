import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// Config à parte da suíte de segurança (npm run test:seguranca).
// Fica fora do `npm test` porque tem um teste que falha de propósito enquanto o
// cadastro público estiver ligado no Supabase, e os signUp gastam cota de e-mail do Auth.
export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/seguranca/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ['VITE_', 'E2E_']),
  },
}))
