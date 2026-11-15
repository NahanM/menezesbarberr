import { expect, test, type Page } from '@playwright/test'
import { ESPERA_LOGIN_REAL, entrarNoPainel, estadoDoWorker, manterSessaoComRelogioSimulado, simularEquipe } from '../ajudas-login.ts'

// Captura visual do /painel para o portão de direção de arte (Fase 4).
// Login REAL uma vez (E2E_EMAIL/E2E_SENHA) para ter sessão; os dados da agenda são SIMULADOS com
// page.route, então nada é gravado no banco remoto. Sem asserção de layout: o julgamento é humano.

const PASTA = 'test-results/visual'
const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA
const ESTADO = estadoDoWorker('painel-visual')

test.skip(!(EMAIL && SENHA), 'E2E_EMAIL e E2E_SENHA não definidos no .env')

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const B1 = '00000000-0000-4000-8000-0000000000b1'
const B2 = '00000000-0000-4000-8000-0000000000b2'
const B3 = '00000000-0000-4000-8000-0000000000b3'
const BARBEIROS = [
  { id: B1, nome: 'Rafael' },
  { id: B2, nome: 'Diego' },
  { id: B3, nome: 'Caio' },
]
const NOME: Record<string, string> = { [B1]: 'Rafael', [B2]: 'Diego', [B3]: 'Caio' }
const sp = (hhmm: string, dia = DIA) => `${dia}T${hhmm}:00-03:00`
const somaDia = (n: number) => {
  const d = new Date(`${DIA}T12:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

let n = 0
const ag = (b: string, de: string, ate: string, status: string, cliente: string, servico = 'Corte', dia = DIA) => {
  n++
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    codigo: `T${String(n).padStart(5, '0')}`,
    status,
    inicio: sp(de, dia),
    fim: sp(ate, dia),
    barbeiro_id: b,
    barbeiro_nome: NOME[b],
    servico_nome: servico,
    servico_tipo: servico.startsWith('Combo') ? 'combo' : 'avulso',
    cliente_nome: cliente,
    cliente_telefone: '11999990000',
  }
}
const bl = (b: string | null, de: string, ate: string, motivo: string, dia = DIA) => {
  n++
  return {
    id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    barbeiro_id: b,
    barbeiro_nome: b ? NOME[b] : null,
    inicio: sp(de, dia),
    fim: sp(ate, dia),
    motivo,
  }
}

const AGENDA = [
  ag(B1, '09:00', '09:40', 'pendente', 'Ana Souza'),
  ag(B1, '10:00', '11:00', 'confirmado', 'Bruno Lima', 'Combo Essencial'),
  ag(B1, '10:00', '10:40', 'cancelado', 'Carla Dias'),
  ag(B1, '14:00', '15:30', 'pendente', 'Marcos Vieira', 'Combo Cuidado Completo'),
  ag(B1, '16:00', '16:30', 'confirmado', 'Felipe Rocha', 'Corte'),
  ag(B2, '09:30', '10:00', 'concluido', 'Davi Melo', 'Barba'),
  ag(B2, '14:00', '14:30', 'concluido', 'Gustavo Reis'),
  ag(B2, '15:00', '15:15', 'nao_compareceu', 'Edu Santos', 'Sobrancelha'),
  ag(B2, '17:00', '18:40', 'pendente', 'Lucas Prado', 'Combo Experiência Premium'),
  ag(B3, '11:00', '11:40', 'confirmado', 'Pedro Alves'),
  // Semana
  ag(B1, '10:00', '11:00', 'confirmado', 'Rui Costa', 'Combo Essencial', somaDia(1)),
  ag(B2, '15:00', '15:30', 'pendente', 'Tiago Nunes', 'Corte', somaDia(1)),
  ag(B3, '09:00', '09:30', 'pendente', 'Igor Paz', 'Corte', somaDia(2)),
]
const BLOQUEIOS = [
  bl(null, '12:00', '13:00', 'Almoço da equipe'),
  bl(B3, '15:00', '18:00', 'Folga do Caio'),
  bl(B2, '09:00', '20:00', 'Folga', somaDia(1)),
]

async function simular(page: Page, falhar = false) {
  const json = (c: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(c) })
  const entre = (inst: string, de: string, ate: string) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(inst))
    return d >= de && d <= ate
  }
  await simularEquipe(page)
  await page.route('**/rest/v1/barbeiros*', (r) => r.fulfill(json(BARBEIROS)))
  await page.route('**/rest/v1/rpc/listar_bloqueios*', (r) => {
    const { p_de, p_ate } = r.request().postDataJSON() as { p_de: string; p_ate: string }
    return r.fulfill(json(BLOQUEIOS.filter((k) => entre(k.inicio, p_de, p_ate ?? p_de))))
  })
  await page.route('**/rest/v1/rpc/listar_agenda*', (r) => {
    if (falhar) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
    const { p_de, p_ate } = r.request().postDataJSON() as { p_de: string; p_ate: string }
    return r.fulfill(json(AGENDA.filter((a) => entre(a.inicio, p_de, p_ate ?? p_de))))
  })
  // Ações nunca chegam ao banco.
  for (const f of ['mudar_status', 'criar_bloqueio', 'remover_bloqueio']) {
    await page.route(`**/rest/v1/rpc/${f}*`, (r) => r.fulfill({ status: 204 }))
  }
}

const shot = (page: Page, nome: string, fullPage = false) =>
  page.screenshot({ path: `${PASTA}/painel-${test.info().project.name}-${nome}.png`, fullPage })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }, info) => {
  test.setTimeout(ESPERA_LOGIN_REAL * 3) // duas idas ao Auth real, mais as capturas
  // Capturas da tela de login e do erro de senha (nada a ver com a sessão guardada abaixo).
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL })
  try {
    const page = await ctx.newPage()
    await page.goto('/painel')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await page.waitForTimeout(800) // deixa a entrada do login assentar antes da captura
    await page.screenshot({ path: `${PASTA}/painel-${info.project.name}-01-login.png` })
    await page.getByLabel('E-mail').fill(EMAIL!)
    await page.getByLabel('Senha').fill('senha-errada-visual')
    await page.getByRole('button', { name: 'Entrar' }).click()
    // Rede real (Auth do Supabase): espera o aviso de erro em vez de um tempo fixo.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: ESPERA_LOGIN_REAL })
    await page.screenshot({ path: `${PASTA}/painel-${info.project.name}-02-login-erro.png` })
  } finally {
    await ctx.close()
  }
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

test('sem acesso', async ({ browser }, info) => {
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport })
  const page = await ctx.newPage()
  const agora = Math.floor(Date.now() / 1000)
  const jwt = (c: object) =>
    [{ alg: 'HS256', typ: 'JWT' }, c].map((p) => Buffer.from(JSON.stringify(p)).toString('base64url')).join('.') + '.x'
  const usuario = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'c@exemplo.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const sessao = { access_token: jwt({ sub: usuario.id, role: 'authenticated', exp: agora + 3600 }), refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, user: usuario }
  await page.route('**/auth/v1/token*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessao) }))
  await page.route('**/rest/v1/rpc/is_equipe*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'false' }))
  await page.goto('/painel')
  await page.getByLabel('E-mail').fill('c@exemplo.com')
  await page.getByLabel('Senha').fill('x')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sem acesso a este painel.' })).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, '03-sem-acesso')
  await ctx.close()
})

test.describe('logado', () => {
  test.use({ storageState: ESTADO })

  test('erro da agenda', async ({ page }) => {
    await simular(page, true)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('alert')).toBeVisible()
    await page.waitForTimeout(400)
    await shot(page, '04-erro')
  })

  test('dia, semana, diálogos', async ({ page }) => {
    test.setTimeout(120_000)
    await manterSessaoComRelogioSimulado(page)
    await page.clock.setFixedTime(new Date(`${DIA}T15:20:00-03:00`))
    await simular(page)
    await page.goto(`/painel?dia=${DIA}`)
    await expect(page.getByRole('button', { name: /Ana Souza/ })).toBeVisible()
    await page.waitForTimeout(500)
    await shot(page, '05-dia')
    await shot(page, '05-dia-full', true)
    await page.evaluate(() => window.scrollTo(0, 900))
    await page.waitForTimeout(300)
    await shot(page, '05-dia-meio')

    if (test.info().project.name === 'celular') {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('tab', { name: /Caio/ }).click()
      await page.waitForTimeout(300)
      await shot(page, '06-aba-caio-full', true)
      await page.getByRole('tab', { name: /Rafael/ }).click()
    }

    await page.getByRole('button', { name: /(Mostrar|Ocultar) cancelados/ }).click()
    await page.waitForTimeout(300)
    await shot(page, '07-cancelados-full', true)

    await page.getByRole('button', { name: /Bruno Lima/ }).click()
    await page.waitForTimeout(400)
    await shot(page, '08-detalhes-confirmado')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Ana Souza/ }).click()
    await page.waitForTimeout(400)
    await shot(page, '09-detalhes-pendente')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Bloqueio, 12:00/ }).first().click()
    await page.waitForTimeout(400)
    await shot(page, '10-remover-bloqueio')
    await page.getByRole('button', { name: 'Remover bloqueio' }).click()
    await page.waitForTimeout(300)
    await shot(page, '11-remover-confirmar')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Bloquear horário' }).click()
    await page.waitForTimeout(400)
    await shot(page, '12-novo-bloqueio')
    await shot(page, '12-novo-bloqueio-full', true)
    await page.keyboard.press('Escape')

    await page.goto(`/painel?dia=${DIA}&visao=semana`)
    await expect(page.getByText(/Tiago Nunes|Rafael/).first()).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, '13-semana')
    await shot(page, '13-semana-full', true)

    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (ov > 0) await shot(page, `OVERFLOW-X-${ov}px`)
  })
})
