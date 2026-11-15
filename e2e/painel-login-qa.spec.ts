import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// QA do incremento 4.1 (login do /painel). Tudo com Auth e is_equipe simulados via page.route:
// nenhum login real, então não gasta o limite de taxa do Supabase.

const JSON_OK = { contentType: 'application/json' }
const agora = () => Math.floor(Date.now() / 1000)
const jwt = (corpo: object) =>
  [{ alg: 'HS256', typ: 'JWT' }, corpo].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') + '.sig'

function montarSessao(email = 'equipe@exemplo.com', expiraEm = 3600) {
  const id = '00000000-0000-4000-8000-000000000002'
  const exp = agora() + expiraEm
  return {
    access_token: jwt({ sub: id, role: 'authenticated', exp }),
    refresh_token: 'refresh-falso',
    token_type: 'bearer',
    expires_in: expiraEm,
    expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
}

const CHAVE_STORAGE = () => `sb-${new URL(process.env.VITE_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`

interface Contagem {
  token: number
  corpos: string[]
  equipe: number
  logout: number
}

/** Simula Auth e is_equipe. `equipe` recebe o número da chamada e decide a resposta. */
async function simular(
  alvo: Page | BrowserContext,
  opts: {
    email?: string
    equipe?: (n: number) => 'true' | 'false' | 'abort' | number
    token?: 'ok' | 'invalido' | 'abort' | 'limite'
    atrasoMs?: number
  } = {},
): Promise<Contagem> {
  const c: Contagem = { token: 0, corpos: [], equipe: 0, logout: 0 }
  await alvo.route('**/auth/v1/token*', async (rota) => {
    c.token++
    c.corpos.push(rota.request().postData() ?? '')
    if (opts.atrasoMs) await new Promise((r) => setTimeout(r, opts.atrasoMs))
    const modo = opts.token ?? 'ok'
    if (modo === 'abort') return rota.abort('connectionreset')
    if (modo === 'limite')
      return rota.fulfill({ status: 429, ...JSON_OK, body: JSON.stringify({ code: 429, error_code: 'over_request_rate_limit', msg: 'rate' }) })
    if (modo === 'invalido')
      return rota.fulfill({ status: 400, ...JSON_OK, body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) })
    return rota.fulfill({ status: 200, ...JSON_OK, body: JSON.stringify(montarSessao(opts.email)) })
  })
  await alvo.route('**/auth/v1/logout*', (rota) => {
    c.logout++
    return rota.fulfill({ status: 204, body: '' })
  })
  await alvo.route('**/rest/v1/rpc/is_equipe*', (rota) => {
    c.equipe++
    const r = (opts.equipe ?? (() => 'true'))(c.equipe)
    if (r === 'abort') return rota.abort('connectionreset')
    if (typeof r === 'number') return rota.fulfill({ status: r, ...JSON_OK, body: '{"message":"boom"}' })
    return rota.fulfill({ status: 200, ...JSON_OK, body: r })
  })
  return c
}

const entrar = async (page: Page, email = 'equipe@exemplo.com', senha = 'x') => {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
}
const agenda = (page: Page) => page.getByRole('heading', { level: 1, name: 'Agenda do dia' })

async function semRolagemHorizontal(page: Page) {
  const { l, v } = await page.evaluate(() => ({ l: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }))
  expect(l).toBeLessThanOrEqual(v)
}

/** Navegação do lado do cliente (sem recarregar), como um link faria. */
const irPara = (page: Page, caminho: string) =>
  page.evaluate((p) => {
    window.history.pushState({}, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, caminho)

test.describe('formulário', () => {
  test('Enter na senha envia uma vez, e-mail com espaços é aparado', async ({ page }) => {
    const c = await simular(page, { token: 'invalido' })
    await page.goto('/painel')
    await page.getByLabel('E-mail').fill('  alguem@exemplo.com  ')
    await page.getByLabel('Senha').fill('segredo')
    await page.getByLabel('Senha').press('Enter')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    expect(c.token).toBe(1)
    expect(JSON.parse(c.corpos[0]).email).toBe('alguem@exemplo.com')
  })

  test('Enter no campo e-mail também envia', async ({ page }) => {
    const c = await simular(page, { token: 'invalido' })
    await page.goto('/painel')
    await page.getByLabel('Senha').fill('segredo')
    await page.getByLabel('E-mail').fill('a@b.co')
    await page.getByLabel('E-mail').press('Enter')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    expect(c.token).toBe(1)
  })

  test('validação marca só o campo com problema', async ({ page }) => {
    const c = await simular(page)
    await page.goto('/painel')
    const email = page.getByLabel('E-mail')
    const senha = page.getByLabel('Senha')
    const botao = page.getByRole('button', { name: 'Entrar' })

    await botao.click() // ambos vazios: marca o e-mail
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(senha).toHaveAttribute('aria-invalid', 'false')

    await email.fill('a@b.co') // só a senha vazia
    await botao.click()
    await expect(page.getByRole('alert')).toHaveText('Digite a senha.')
    await expect(senha).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAttribute('aria-invalid', 'false')
    await expect(senha).toBeFocused()

    await email.fill('sem-arroba') // e-mail inválido com senha preenchida
    await senha.fill('x')
    await botao.click()
    await expect(page.getByRole('alert')).toHaveText('Digite um e-mail válido.')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(senha).toHaveAttribute('aria-invalid', 'false')
    await expect(email).toBeFocused()

    await email.fill('   ') // só espaços conta como vazio
    await botao.click()
    await expect(page.getByRole('alert')).toHaveText('Digite o e-mail.')
    expect(c.token).toBe(0)
  })

  test('duplo clique e Enter repetido disparam um único login', async ({ page }) => {
    const c = await simular(page, { token: 'invalido', atrasoMs: 600 })
    await page.goto('/painel')
    await page.getByLabel('E-mail').fill('a@b.co')
    await page.getByLabel('Senha').fill('x')
    await page.getByRole('button', { name: 'Entrar' }).dblclick()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    expect(c.token).toBe(1)
  })

  test('limite de taxa (429) mostra mensagem própria', async ({ page }) => {
    await simular(page, { token: 'limite' })
    await page.goto('/painel')
    await entrar(page)
    await expect(page.getByRole('alert')).toHaveText('Muitas tentativas. Espere um pouco e tente de novo.')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  test('falha de rede no Auth: mensagem de conexão, campos preservados, segunda tentativa funciona', async ({ page }) => {
    let falhar = true
    await simular(page)
    await page.unroute('**/auth/v1/token*')
    await page.route('**/auth/v1/token*', (rota) => {
      if (falhar) return rota.abort('connectionreset')
      return rota.fulfill({ status: 200, ...JSON_OK, body: JSON.stringify(montarSessao()) })
    })
    await page.goto('/painel')
    await entrar(page, 'a@b.co', 'minha-senha')
    await expect(page.getByRole('alert')).toHaveText('Sem conexão. Confira a internet e tente de novo.')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    await expect(page.getByLabel('E-mail')).toHaveValue('a@b.co')
    await expect(page.getByLabel('Senha')).toHaveValue('minha-senha')
    falhar = false
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(agenda(page)).toBeVisible()
  })
})

test.describe('is_equipe', () => {
  for (const [nome, falha] of [
    ['rede cai', 'abort'],
    ['servidor responde 500', 500],
  ] as const) {
    test(`${nome}: "Tentar de novo" aparece e funciona`, async ({ page }) => {
      const c = await simular(page, { equipe: (n) => (n === 1 ? falha : 'true') })
      await page.goto('/painel')
      await entrar(page)
      await expect(page.getByRole('heading', { level: 1, name: 'Não deu para conferir seu acesso.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
      await semRolagemHorizontal(page)
      await expect(agenda(page)).toHaveCount(0)
      await page.getByRole('button', { name: 'Tentar de novo' }).click()
      await expect(agenda(page)).toBeVisible()
      expect(c.equipe).toBe(2)
    })
  }

  test('falha repetida mantém o botão e permite nova tentativa', async ({ page }) => {
    const c = await simular(page, { equipe: (n) => (n < 3 ? 'abort' : 'true') })
    await page.goto('/painel')
    await entrar(page)
    const tentar = page.getByRole('button', { name: 'Tentar de novo' })
    await tentar.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Não deu para conferir seu acesso.' })).toBeVisible()
    await tentar.click()
    await expect(agenda(page)).toBeVisible()
    expect(c.equipe).toBe(3)
  })

  test('sem acesso não mostra cabeçalho do painel nem "Tentar de novo"', async ({ page }) => {
    await simular(page, { equipe: () => 'false' })
    await page.goto('/painel')
    await entrar(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Sem acesso a este painel.' })).toBeVisible()
    await expect(page.getByRole('banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0)
  })

  test('e-mail enorme não gera rolagem horizontal e o Sair continua visível', async ({ page }) => {
    const longo = `${'a'.repeat(70)}@${'dominio'.repeat(8)}.com.br`
    await simular(page, { email: longo })
    await page.goto('/painel')
    await entrar(page, longo)
    await expect(agenda(page)).toBeVisible()
    await semRolagemHorizontal(page)
    await expect(page.getByRole('button', { name: 'Sair' })).toBeInViewport()
  })
})

test.describe('sessão', () => {
  test('sessão expirada no storage com refresh recusado volta ao login', async ({ page }) => {
    await page.route('**/auth/v1/token*', (rota) =>
      rota.fulfill({ status: 400, ...JSON_OK, body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }) }),
    )
    await page.route('**/rest/v1/rpc/is_equipe*', (rota) => rota.fulfill({ status: 200, ...JSON_OK, body: 'true' }))
    await page.addInitScript(([chave, valor]) => localStorage.setItem(chave, valor), [CHAVE_STORAGE(), JSON.stringify(montarSessao('equipe@exemplo.com', -3600))])
    await page.goto('/painel')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(agenda(page)).toHaveCount(0)
  })

  test('sessão válida no storage abre direto', async ({ page }) => {
    await simular(page)
    await page.addInitScript(([chave, valor]) => localStorage.setItem(chave, valor), [CHAVE_STORAGE(), JSON.stringify(montarSessao())])
    await page.goto('/painel')
    await expect(agenda(page)).toBeVisible()
  })

  test('sair em outra aba leva esta aba de volta ao login', async ({ context, page }) => {
    await simular(context)
    await page.goto('/painel')
    await entrar(page)
    await expect(agenda(page)).toBeVisible()
    const outra = await context.newPage()
    await outra.goto('/painel')
    await expect(agenda(outra)).toBeVisible()
    await outra.getByRole('button', { name: 'Sair' }).click()
    await expect(outra.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible({ timeout: 5000 })
    await expect(agenda(page)).toHaveCount(0)
  })

  // Limitação do supabase-js: apagar a chave à mão não dispara evento; a aba só percebe na próxima chamada ao Auth.
  test('sessão apagada do storage em outra aba: ao voltar o foco o painel some', async ({ context, page }) => {
    test.fail(true, 'supabase-js não observa remoção manual do localStorage')
    await simular(context)
    await page.goto('/painel')
    await entrar(page)
    await expect(agenda(page)).toBeVisible()
    const outra = await context.newPage()
    await outra.goto('/painel')
    await outra.evaluate((k) => localStorage.removeItem(k), CHAVE_STORAGE())
    await page.bringToFront()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible({ timeout: 5000 })
  })

  test('depois de Sair, o botão Voltar do navegador não mostra dado do painel', async ({ page }) => {
    await simular(page)
    await page.goto('/')
    await irPara(page, '/painel')
    await entrar(page)
    await expect(agenda(page)).toBeVisible()
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await page.goBack()
    await page.goForward()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByText('Agenda do dia')).toHaveCount(0)
    await expect(page.getByText('equipe@exemplo.com')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })

  test('falha de rede no Sair não deixa o botão preso em "Saindo"', async ({ page }) => {
    await simular(page)
    await page.route('**/auth/v1/logout*', (rota) => rota.abort('connectionreset'))
    await page.goto('/painel')
    await entrar(page)
    await expect(agenda(page)).toBeVisible()
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('button', { name: 'Entrar' }).or(page.getByRole('button', { name: 'Sair' }))).toBeVisible()
    await expect(page.getByRole('button', { name: 'Saindo' })).toHaveCount(0)
  })
})

test.describe('meta robots e Lenis', () => {
  test('noindex existe uma vez no /painel e some ao voltar para /', async ({ page }) => {
    await simular(page)
    await page.goto('/painel')
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1)
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await irPara(page, '/painel')
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1)
    await irPara(page, '/')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    for (let i = 0; i < 3; i++) {
      await irPara(page, '/painel')
      await irPara(page, '/')
    }
    await irPara(page, '/painel')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1)
    await entrar(page)
    await expect(agenda(page)).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1)
  })

  test('a landing recupera o Lenis depois de visitar o /painel (desktop)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'Lenis só liga em tela larga')
    await page.goto('/')
    await expect(page.locator('html.lenis')).toHaveCount(1)
    await irPara(page, '/painel')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page.locator('html.lenis')).toHaveCount(0)
    await irPara(page, '/')
    await expect(page.locator('html.lenis')).toHaveCount(1)
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 1200)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200)
  })
})

test('sem rolagem horizontal no login e com erro, com e-mail gigante', async ({ page }) => {
  await simular(page, { token: 'invalido' })
  await page.goto('/painel')
  await semRolagemHorizontal(page)
  await entrar(page, 'a'.repeat(200) + '@x.co', 'x')
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
  await semRolagemHorizontal(page)
})

test('foco: a borda do campo muda e o botão tem contorno visível', async ({ page }) => {
  await page.goto('/painel')
  const email = page.getByLabel('E-mail')
  const borda = () => email.evaluate((e) => getComputedStyle(e).borderTopColor)
  await page.getByLabel('Senha').focus()
  const semFoco = await borda()
  await email.focus()
  expect(await borda()).not.toBe(semFoco)
  await page.getByLabel('Senha').focus()
  await page.keyboard.press('Tab')
  const botao = page.getByRole('button', { name: 'Entrar' })
  await expect(botao).toBeFocused()
  const { estilo, largura } = await botao.evaluate((e) => {
    const s = getComputedStyle(e)
    return { estilo: s.outlineStyle, largura: parseFloat(s.outlineWidth) }
  })
  expect(estilo !== 'none' && largura > 0).toBe(true)
})
