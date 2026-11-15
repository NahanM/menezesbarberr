import { expect, test, type Page } from '@playwright/test'

// Login do /painel (incremento 4.1). O erro de credencial é testado com a rota do Auth mockada
// (determinístico) e também contra o Supabase real. O login válido usa E2E_EMAIL/E2E_SENHA do .env.

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const temConta = Boolean(EMAIL && SENHA)
const MOTIVO = 'E2E_EMAIL e E2E_SENHA não definidos no .env'

async function semRolagemHorizontal(page: Page) {
  const { largura, visivel } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    visivel: document.documentElement.clientWidth,
  }))
  expect(largura).toBeLessThanOrEqual(visivel)
}

async function preencherEEntrar(page: Page, email: string, senha: string) {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test.describe('formulário de login', () => {
  test('sem sessão mostra o formulário acessível, sem rolagem horizontal', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toHaveAttribute('autocomplete', 'email')
    await expect(page.getByLabel('Senha')).toHaveAttribute('autocomplete', 'current-password')
    await semRolagemHorizontal(page)
  })

  test('campos vazios mostram aviso sem chamar o servidor', async ({ page }) => {
    let chamadas = 0
    await page.route('**/auth/v1/token*', (rota) => {
      chamadas++
      return rota.abort()
    })
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('alert')).toHaveText('Digite o e-mail.')
    await expect(page.getByLabel('E-mail')).toBeFocused()
    expect(chamadas).toBe(0)
  })

  test('credencial inválida mostra a mensagem genérica e o botão volta ao normal', async ({ page }) => {
    await page.route('**/auth/v1/token*', async (rota) => {
      await new Promise((r) => setTimeout(r, 300))
      await rota.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 400,
          error_code: 'invalid_credentials',
          msg: 'Invalid login credentials',
        }),
      })
    })
    await page.goto('/painel')
    await preencherEEntrar(page, 'alguem@exemplo.com', 'senha-errada')
    await expect(page.getByRole('button', { name: 'Entrando' })).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    await semRolagemHorizontal(page)
  })

  test('senha errada no Supabase real mostra a mesma mensagem', async ({ page }) => {
    test.skip(!temConta, MOTIVO)
    await page.goto('/painel')
    await preencherEEntrar(page, EMAIL!, `${SENHA!}-errada`)
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
  })
})

test.describe('com a conta da equipe', () => {
  test.skip(!temConta, MOTIVO)

  test('entra, vê o painel, recarrega sem piscar o formulário e sai', async ({ page }) => {
    // Registra se o formulário chegou a existir no DOM depois do carregamento (piscada).
    await page.addInitScript(() => {
      const w = window as unknown as { __viuLogin: boolean }
      w.__viuLogin = false
      new MutationObserver(() => {
        if (document.getElementById('painel-email')) w.__viuLogin = true
      }).observe(document, { childList: true, subtree: true })
    })

    await page.goto('/painel')
    await preencherEEntrar(page, EMAIL!, SENHA!)

    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible()
    await expect(page.getByRole('banner').getByText(EMAIL!)).toBeVisible()
    await expect(page.getByLabel('E-mail')).toHaveCount(0)
    await semRolagemHorizontal(page)

    // Recarregar mantém a sessão, e o formulário nunca aparece no meio do caminho.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda do dia' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __viuLogin: boolean }).__viuLogin)).toBe(false)

    // Sair volta ao formulário, e recarregar depois de sair continua no formulário.
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })
})

test('logado fora da equipe vê "Sem acesso a este painel." e consegue sair', async ({ page }) => {
  // is_equipe responde false; o Auth e o token são simulados (nenhuma conta é criada).
  const agora = Math.floor(Date.now() / 1000)
  const jwt = (corpo: object) =>
    [{ alg: 'HS256', typ: 'JWT' }, corpo].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') +
    '.assinatura'
  const usuario = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'cliente@exemplo.com',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
  const sessao = {
    access_token: jwt({ sub: usuario.id, role: 'authenticated', exp: agora + 3600 }),
    refresh_token: 'refresh-falso',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    user: usuario,
  }
  await page.route('**/auth/v1/token*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessao) }),
  )
  await page.route('**/auth/v1/logout*', (rota) => rota.fulfill({ status: 204, body: '' }))
  await page.route('**/rest/v1/rpc/is_equipe*', (rota) =>
    rota.fulfill({ status: 200, contentType: 'application/json', body: 'false' }),
  )

  await page.goto('/painel')
  await preencherEEntrar(page, 'cliente@exemplo.com', 'qualquer')
  await expect(page.getByRole('heading', { level: 1, name: 'Sem acesso a este painel.' })).toBeVisible()
  await expect(page.getByText('Agenda do dia')).toHaveCount(0)
  await semRolagemHorizontal(page)

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})
