import { expect, test, type Page } from '@playwright/test'
import { entrarNoPainel, estadoDoWorker, simularEquipe } from './ajudas-login.ts'

// S2: pendente vencido aparece como "Expirado" e a ação em pedido vencido avisa e rebusca a agenda.
// Login real; agenda e mudar_status simulados (nada é gravado).
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const ESTADO = estadoDoWorker('painel-expirado')
test.skip(!EMAIL || !SENHA, 'E2E_EMAIL e E2E_SENHA não definidos')
test.use({ storageState: ESTADO })
test.beforeAll(async ({ browser }, info) => {
  if (EMAIL && SENHA) await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const d = new Date(`${hoje}T12:00:00Z`)
d.setUTCDate(d.getUTCDate() - 3)
const DIA = d.toISOString().slice(0, 10)
const B1 = '00000000-0000-4000-8000-0000000000b1'
const base = {
  barbeiro_id: B1, barbeiro_nome: 'Rafael', servico_nome: 'Corte', servico_tipo: 'avulso',
  cliente_telefone: '5511999990000', expirado_em: null as string | null,
}
const json = (corpo: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(corpo) })

async function simular(page: Page, opcoes: { jaExpirado?: boolean }) {
  let vencido = Boolean(opcoes.jaExpirado)
  let buscas = 0
  const linhas = () => [
    { ...base, id: '10000000-0000-4000-8000-000000000001', codigo: 'EXP001', cliente_nome: 'Ana Vencida',
      status: vencido ? 'cancelado' : 'pendente', expirado_em: vencido ? `${DIA}T11:00:00-03:00` : null,
      inicio: `${DIA}T09:00:00-03:00`, fim: `${DIA}T09:40:00-03:00` },
    { ...base, id: '10000000-0000-4000-8000-000000000002', codigo: 'MAN002', cliente_nome: 'Bia Manual',
      status: 'cancelado', inicio: `${DIA}T10:00:00-03:00`, fim: `${DIA}T10:40:00-03:00` },
    { ...base, id: '10000000-0000-4000-8000-000000000003', codigo: 'OKK003', cliente_nome: 'Caio Ok',
      status: 'confirmado', inicio: `${DIA}T11:00:00-03:00`, fim: `${DIA}T11:40:00-03:00` },
  ]
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json([{ id: B1, nome: 'Rafael' }])))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => r.fulfill(json([])))
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => { buscas++; return r.fulfill(json(linhas())) })
  await page.route('**/rest/v1/rpc/mudar_status*', (r) => {
    const { p_status } = r.request().postDataJSON() as { p_status: string }
    vencido = true // o servidor expira em vez de aplicar
    const l = linhas()[0]
    void p_status
    return r.fulfill(json([l]))
  })
  return { buscas: () => buscas }
}
const bloco = (page: Page, nome: string) => page.locator(`section[id^="coluna-"] button[aria-label*="${nome}"]`)
const dialogo = (page: Page) => page.getByRole('dialog')

test('bloco expirado mostra "Expirado"; cancelado manual continua "Cancelado"', async ({ page }) => {
  await simular(page, { jaExpirado: true })
  await page.goto(`/painel?dia=${DIA}&cancelados=1`)
  await expect(bloco(page, 'Ana Vencida')).toHaveAttribute('aria-label', /Expirado$/, { timeout: 20_000 })
  await expect(bloco(page, 'Bia Manual')).toHaveAttribute('aria-label', /Cancelado$/)
  await expect(bloco(page, 'Caio Ok')).toHaveAttribute('aria-label', /Confirmado$/)
  await bloco(page, 'Ana Vencida').click()
  await expect(dialogo(page).getByText('Expirado', { exact: true })).toBeVisible()
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)
})

for (const acao of ['Confirmar', 'Cancelar'] as const) {
  test(`${acao} em pedido vencido: ${acao === 'Confirmar' ? 'mostra aviso e rebusca' : 'cancelar também termina sem erro enganoso'}`, async ({ page }) => {
    const sim = await simular(page, {})
    await page.goto(`/painel?dia=${DIA}&cancelados=1`)
    await expect(bloco(page, 'Ana Vencida')).toHaveAttribute('aria-label', /Pendente$/, { timeout: 20_000 })
    await bloco(page, 'Ana Vencida').click()
    const antes = sim.buscas()
    if (acao === 'Confirmar') {
      await dialogo(page).getByRole('button', { name: 'Confirmar', exact: true }).click()
      await expect(dialogo(page).getByRole('alert')).toContainText('expirou')
      await expect.poll(() => sim.buscas()).toBeGreaterThan(antes)
      await page.keyboard.press('Escape')
      await expect(bloco(page, 'Ana Vencida')).toHaveAttribute('aria-label', /Expirado$/)
    } else {
      await dialogo(page).getByRole('button', { name: 'Cancelar agendamento' }).click()
      await dialogo(page).getByRole('button', { name: 'Confirmar cancelamento?' }).click()
      await expect(dialogo(page).getByRole('alert')).toHaveCount(0)
      await expect(dialogo(page).getByRole('status')).toContainText('cancelado')
    }
  })
}
