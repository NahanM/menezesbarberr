import { configDefaults, defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // tests/seguranca roda à parte (npm run test:seguranca): tem teste que falha de propósito
    // enquanto o cadastro público estiver ligado no Supabase e gasta cota de e-mail do Auth.
    exclude: [...configDefaults.exclude, 'tests/seguranca/**'],
    // Testes de função pura rodam em node. Para testar componente, use no topo do arquivo:
    // // @vitest-environment jsdom
    environment: 'node',
    // Carrega o .env (incluindo VITE_*, E2E_*) para os testes de integração com o Supabase.
    env: loadEnv(mode, process.cwd(), ['VITE_', 'E2E_']),
  },
}))
