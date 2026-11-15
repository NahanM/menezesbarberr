import { expect, test, type Page } from '@playwright/test'

// S3: limite global (URB18) no /agendar. RPC simulada: nada é gravado.
const HORARIO = '2026-10-14T12:00:00+00:00'

async function ateRevisao(page: Page) {
  const chamadas: unknown[] = []
  await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ inicio: HORARIO }]) }),
  )
  await page.route('**/rest/v1/rpc/criar_agendamento*', (r) => {
    chamadas.push(r.request().postDataJSON())
    if (chamadas.length === 1) {
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'URB18', message: 'limite', details: null, hint: null }) })
    }
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ codigo: 'ABC123', barbeiro_nome: 'Rafael', servico_nome: 'Essencial', inicio: HORARIO, preco_total_centavos: 8000, duracao_total_min: 60 }]),
    })
  })
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('label').filter({ has: page.getByRole('radio', { name: '09:00' }) }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByRole('heading', { name: 'Confere aí' }).waitFor()
  return chamadas
}

test('URB18: link do WhatsApp codificado, rel seguro, Tentar de novo repete e conclui', async ({ page }) => {
  const chamadas = await ateRevisao(page)
  await page.getByRole('button', { name: 'Confirmar' }).click()
  const grupo = page.getByRole('group', { name: /Muitos pedidos agora/ })
  await expect(grupo).toBeVisible()
  const link = grupo.getByRole('link', { name: 'Chamar no WhatsApp' })
  const href = (await link.getAttribute('href'))!
  expect(href).toContain(`text=${encodeURIComponent('Olá, pessoal da Menezes! Quero agendar um horário.')}`)
  expect(href).not.toMatch(/ |á/)
  expect(await link.getAttribute('rel')).toMatch(/noopener/)
  expect(await link.getAttribute('rel')).toMatch(/noreferrer/)
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)
  await grupo.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect.poll(() => chamadas.length).toBe(2)
  expect(chamadas[1]).toEqual(chamadas[0]) // mesmos dados
  await expect(grupo).toBeHidden()
  await expect(page.getByText('ABC123')).toBeVisible()
})
