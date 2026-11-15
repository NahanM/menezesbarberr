import { defineConfig, devices } from '@playwright/test'

// Carrega o .env (E2E_EMAIL, E2E_SENHA) para os testes. Sem .env, segue sem erro (ex.: CI com variáveis já definidas).
try {
  process.loadEnvFile()
} catch {
  // .env ausente
}

const PORTA = 4173
const URL_BASE = `http://localhost:${PORTA}`

export default defineConfig({
  testDir: 'e2e',
  // O Playwright apaga o outputDir a cada execução; capturas visuais ficam em test-results/visual/.
  outputDir: 'test-results/playwright',
  // 1 worker por enquanto: testes futuros mexem na mesma agenda do banco.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: URL_BASE,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'celular',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 }, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // Testa o site de produção (build + preview), que é o que vai ao ar.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORTA} --strictPort`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
