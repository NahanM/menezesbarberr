import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// S4: honeypot "url_empresa" no passo 4 do /agendar. RPC simulada: nada é gravado.
const HORARIO = '2026-10-14T12:00:00+00:00'

async function ateDados(page: Page) {
  const chamadas: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/horarios_disponiveis*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ inicio: HORARIO }]) }),
  )
  await page.route('**/rest/v1/rpc/criar_agendamento*', (r) => {
    const corpo = r.request().postDataJSON() as Record<string, unknown>
    chamadas.push(corpo)
    // Simula o servidor: honeypot preenchido = URB20; vazio = reserva normal.
    if (typeof corpo.p_website === 'string' && corpo.p_website.trim() !== '') {
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'URB20', message: 'Não foi possível enviar agora.', details: null, hint: null }) })
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
  await page.getByRole('heading', { name: 'Seus dados' }).waitFor()
  return chamadas
}

async function preencherEConfirmar(page: Page) {
  await page.getByLabel('Nome').fill('João Silva')
  await page.getByLabel('WhatsApp').fill('11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await page.getByRole('heading', { name: 'Confere aí' }).waitFor()
  await page.getByRole('button', { name: 'Confirmar' }).click()
}

test('o campo existe, está fora da tela, fora do Tab e sem violação de acessibilidade', async ({ page }) => {
  await ateDados(page)
  const campo = page.locator('input[name="url_empresa"]')
  await expect(campo).toHaveCount(1)
  expect(await campo.getAttribute('tabindex')).toBe('-1')
  expect(await campo.getAttribute('autocomplete')).toBe('off')
  expect(await campo.evaluate((el) => el.closest('[aria-hidden="true"]') !== null)).toBe(true)

  // Fora da tela, mas ainda renderizado (display:none seria ignorado por robô).
  const caixa = await campo.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { direita: r.right, display: getComputedStyle(el.parentElement!).display }
  })
  expect(caixa.direita).toBeLessThan(0)
  expect(caixa.display).not.toBe('none')

  // Sem rolagem horizontal.
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)

  // Tab nunca para nele: percorre o formulário e a página inteira.
  await page.getByLabel('Nome').focus()
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name)).not.toBe('url_empresa')
  }
  // Nem o rótulo acessível dele existe para leitor de tela.
  await expect(page.getByRole('textbox', { name: 'Deixe em branco' })).toHaveCount(0)

  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(resultado.violations.map((x) => x.id)).toEqual([])
})

test('pessoa: campo vazio vai para a RPC e a reserva conclui', async ({ page }) => {
  const chamadas = await ateDados(page)
  await preencherEConfirmar(page)
  await expect(page.getByText('ABC123')).toBeVisible()
  expect(chamadas).toHaveLength(1)
  expect(chamadas[0].p_website).toBe('')
})

test('robô: campo preenchido recebe a mensagem de erro e o valor não vai ao rascunho', async ({ page }) => {
  const chamadas = await ateDados(page)
  await page.locator('input[name="url_empresa"]').fill('http://spam.example')
  await preencherEConfirmar(page)
  await expect(page.getByText('Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.')).toBeVisible()
  expect(chamadas).toHaveLength(1)
  expect(chamadas[0].p_website).toBe('http://spam.example')
  await expect(page.getByText('ABC123')).toHaveCount(0)

  const guardado = await page.evaluate(() => JSON.stringify({ ...sessionStorage }))
  expect(guardado).not.toContain('spam.example')
})

test('autofill: depois do URB20, "Tentar de novo" envia o campo vazio e conclui', async ({ page }) => {
  const chamadas = await ateDados(page)
  await page.locator('input[name="url_empresa"]').fill('preenchido pelo navegador')
  await preencherEConfirmar(page)
  const grupo = page.getByRole('group', { name: /Não foi possível enviar agora/ })
  await expect(grupo).toBeVisible()
  await grupo.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect.poll(() => chamadas.length).toBe(2)
  expect(chamadas[0].p_website).toBe('preenchido pelo navegador')
  expect(chamadas[1].p_website).toBe('')
  await expect(page.getByText('ABC123')).toBeVisible()
})
