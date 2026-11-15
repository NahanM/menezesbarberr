import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from '../ajudas-login.ts'

// Capturas do incremento 5.2 (polimento do painel): coluna só com cancelados, diálogo de bloqueio a 360px,
// linha do agora e coluna de hoje na Semana. Login REAL uma vez; agenda SIMULADA com page.route.
// Rodar com FASE=antes e depois de FASE=depois: os arquivos vão para test-results/visual/p52-<fase>-*.png.

const FASE = process.env.FASE ?? 'depois'
const PASTA = 'test-results/visual'
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const ESTADO = estadoDoWorker('painel-p52')

test.skip(!(EMAIL && SENHA), 'E2E_EMAIL e E2E_SENHA não definidos no .env')

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }
const BARBEIROS = Object.entries(NOME).map(([id, nome]) => ({ id, nome }))
const sp = (hhmm: string) => `${DIA}T${hhmm}:00-03:00`

let n = 0
const ag = (b: string, de: string, ate: string, status: string, cliente: string) => {
  n++
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    codigo: `T${String(n).padStart(5, '0')}`,
    status,
    inicio: sp(de),
    fim: sp(ate),
    barbeiro_id: b,
    barbeiro_nome: NOME[b],
    servico_nome: 'Corte',
    servico_tipo: 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}
const AGENDA = [
  ag(B1, '09:00', '09:40', 'pendente', 'Ana Souza'),
  ag(B1, '14:00', '15:30', 'confirmado', 'Marcos Vieira'),
  ag(B1, '07:30', '08:10', 'cancelado', 'Cedo Demais'), // cancelado fora da faixa de horas
  ag(B2, '15:00', '15:40', 'confirmado', 'Gustavo Reis'),
  ag(B3, '11:00', '11:40', 'cancelado', 'Pedro Alves'), // Caio: só cancelados
]
const BLOQUEIOS = [
  { id: '20000000-0000-4000-8000-000000000001', barbeiro_id: B2, barbeiro_nome: 'Diego', inicio: sp('15:00'), fim: sp('18:00'), motivo: 'Folga' },
]

async function simular(page: Page) {
  const json = (c: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(c) })
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json(BLOQUEIOS)))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => r.fulfill(json(AGENDA)))
}
const shot = (page: Page, nome: string, fullPage = false) =>
  page.screenshot({ path: `${PASTA}/p52-${FASE}-${test.info().project.name}-${nome}.png`, fullPage })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }, info) => {
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

test.describe('logado', () => {
  test.use({ storageState: ESTADO })

  test('capturas', async ({ page }) => {
    await manterSessaoComRelogioSimulado(page)
    await page.clock.setFixedTime(new Date(`${DIA}T15:20:00-03:00`))
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('button', { name: /Ana Souza/ })).toBeVisible()
    await page.waitForTimeout(500)
    if (test.info().project.name === 'celular') {
      await page.getByRole('tab', { name: /Caio/ }).click()
      await page.waitForTimeout(300)
      await shot(page, '1-coluna-so-cancelados')
      await page.getByRole('tab', { name: /Rafael/ }).click()
    } else {
      await shot(page, '1-coluna-so-cancelados')
    }
    await page.evaluate(() => window.scrollTo(0, 500))
    await page.waitForTimeout(300)
    await shot(page, '6-linha-agora')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: /cancelados/ }).click()
    await page.waitForTimeout(300)
    await shot(page, '4-filtro-ligado-full', true)
    await page.getByRole('button', { name: 'Bloquear horário' }).click()
    await page.waitForTimeout(500)
    await shot(page, '5-novo-bloqueio')
    await page.keyboard.press('Escape')
    await page.goto(`/painel?dia=${DIA}&visao=semana`)
    await expect(page.getByRole('list', { name: 'Dias da semana' })).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, '7-semana')
  })
})
