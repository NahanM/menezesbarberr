import { expect, test, type Page } from '@playwright/test'

// QA do incremento 5.7: erro ao confirmar com foco no grupo nomeado, Tab até as ações,
// posição estável (Lenis não desfaz a rolagem) com e sem reduced-motion.

const HORARIO = '2026-10-14T12:00:00+00:00'
type Erro = { status: number; body: object }
const GENERICO: Erro = { status: 500, body: { code: 'XX000', message: 'erro', details: null, hint: null } }
const LIMITE: Erro = { status: 400, body: { code: 'URB06', message: 'Limite de pendentes.', details: null, hint: null } }

const MUITOS_PEDIDOS: Erro = { status: 400, body: { code: 'URB18', message: 'Muitos pedidos agora. Tente em alguns minutos.', details: null, hint: null } }

async function ateRevisao(page: Page, erro: Erro) {
  await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ inicio: HORARIO }]) }),
  )
  await page.route('**/rest/v1/rpc/criar_agendamento*', (r) =>
    r.fulfill({ status: erro.status, contentType: 'application/json', body: JSON.stringify(erro.body) }),
  )
  await page.goto('/agendar?combo=essencial')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('label').filter({ has: page.getByRole('radio', { name: '09:00' }) }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByRole('heading', { name: 'Confere aí' }).waitFor()
}

for (const rm of [false, true]) {
  test.describe(`erro ao confirmar${rm ? ' (reduced)' : ''}`, () => {
    test.use({ reducedMotion: rm ? 'reduce' : 'no-preference' })

    test('grupo focado com nome acessível, sem role=alert, posição estável e acima da barra', async ({ page }) => {
      await ateRevisao(page, GENERICO)
      await page.getByRole('button', { name: 'Confirmar' }).click()
      const grupo = page.getByRole('group', { name: /Algo deu errado do nosso lado/ })
      await expect(grupo).toBeFocused()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(grupo).toHaveAttribute('aria-labelledby', 'erro-confirmar-msg')
      await page.waitForTimeout(400)
      const y1 = await page.evaluate(() => window.scrollY)
      await page.waitForTimeout(1500)
      const y2 = await page.evaluate(() => window.scrollY)
      expect(y2).toBe(y1)
      const c = (await grupo.boundingBox())!
      const barra = (await page.getByTestId('barra-acao').boundingBox())!
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y + c.height).toBeLessThanOrEqual(barra.y)
      await expect(grupo).toBeFocused()
    })

    test('Tab do erro chega em Tentar de novo', async ({ page }) => {
      await ateRevisao(page, GENERICO)
      await page.getByRole('button', { name: 'Confirmar' }).click()
      await expect(page.getByRole('group', { name: /Algo deu errado/ })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeFocused()
    })

    test('limite global (URB18): mensagem clara, WhatsApp e Tentar de novo, dados mantidos', async ({ page }) => {
      await ateRevisao(page, MUITOS_PEDIDOS)
      await page.getByRole('button', { name: 'Confirmar' }).click()
      const grupo = page.getByRole('group', { name: /Muitos pedidos agora/ })
      await expect(grupo).toBeFocused()
      await expect(grupo).toContainText('Tente em alguns minutos ou chame no WhatsApp.')
      await expect(grupo).not.toContainText('URB18')
      await page.keyboard.press('Tab')
      await expect(grupo.getByRole('link', { name: 'Chamar no WhatsApp' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(grupo.getByRole('button', { name: 'Tentar de novo' })).toBeFocused()
      // Diferente do limite por telefone (URB06), o Confirmar principal continua habilitado.
      await expect(page.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
    })

    test('Tab do erro de limite chega no WhatsApp', async ({ page }) => {
      await ateRevisao(page, LIMITE)
      await page.getByRole('button', { name: 'Confirmar' }).click()
      const grupo = page.getByRole('group', { name: /aguardando confirmação/ })
      await expect(grupo).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(grupo.getByRole('link', { name: 'Chamar no WhatsApp' })).toBeFocused()
    })
  })
}
