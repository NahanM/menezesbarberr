import { expect, test, type Page } from '@playwright/test'

// Incremento 5.4: estados de carregamento, vazio e erro do /agendar.
// Os já cobertos em agendar.spec.ts e agendar-fluxo.spec.ts (rede fora e erro do banco nos horários,
// URB04/URB06/rede na criação, vazio com próximo dia) não se repetem aqui. Este arquivo cobre:
// erro 500 (JSON e HTML), conexão que trava, esqueleto sem salto de layout, "Tentar de novo" no
// alerta da revisão, falha ao baixar a página (rede fora na troca de rota) e reserva expirada.
// RPCs mockadas com page.route; nada aqui grava no banco.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const HORARIOS = ['2026-10-14T12:00:00+00:00', '2026-10-14T12:30:00+00:00']
const RESERVA = [
  {
    codigo: 'K7M2PX',
    barbeiro_nome: 'Rafael',
    servico_nome: 'Essencial',
    preco_total_centavos: 8000,
    duracao_total_min: 60,
    inicio: HORARIOS[0],
  },
]

const ok = (page: Page) =>
  page.route(ROTA_HORARIOS, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
    }),
  )

/** O texto técnico que NUNCA pode aparecer para o cliente. */
async function semErroTecnico(page: Page) {
  const texto = (await page.locator('body').innerText()).toLowerCase()
  for (const feio of ['internal server error', 'bad gateway', 'postgrest', 'pgrst', 'typeerror', 'undefined', '<html', 'stack']) {
    expect(texto).not.toContain(feio)
  }
}

test.describe('horários', () => {
  test('500 em JSON: mensagem curta, nada técnico, tentar de novo funciona', async ({ page }) => {
    await page.route(ROTA_HORARIOS, (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error: connection to server lost', code: 'XX000' }),
      }),
    )
    await page.goto('/agendar?combo=essencial&passo=3')
    const alerta = page.getByRole('alert')
    await expect(alerta).toContainText('Algo deu errado do nosso lado. Tente de novo.')
    await semErroTecnico(page)

    await page.unroute(ROTA_HORARIOS)
    await ok(page)
    await alerta.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('502 com página HTML (proxy fora do ar) também vira mensagem curta', async ({ page }) => {
    await page.route(ROTA_HORARIOS, (r) =>
      r.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<html><body><h1>502 Bad Gateway</h1></body></html>',
      }),
    )
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.getByRole('alert')).toContainText('Algo deu errado do nosso lado')
    await expect(page.getByRole('alert').getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
    await semErroTecnico(page)
  })

  test('conexão que trava: depois do limite vira "Sem conexão" e dá para tentar de novo', async ({ page }) => {
    // Relógio falso: o limite é de 20 s e o teste não espera isso de verdade.
    await page.clock.install()
    await page.route(ROTA_HORARIOS, () => {
      // Nunca responde.
    })
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.locator('[aria-busy="true"]')).toBeVisible()
    await page.clock.fastForward(21_000)
    await expect(page.getByRole('alert')).toContainText('Sem conexão')

    await page.unroute(ROTA_HORARIOS)
    await ok(page)
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
  })

  test('o esqueleto ocupa o lugar dos horários: a altura não pula quando eles chegam', async ({ page }) => {
    let liberar = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    await page.route(ROTA_HORARIOS, async (r) => {
      await espera
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(HORARIOS.map((inicio) => ({ inicio }))),
      })
    })
    await page.goto('/agendar?combo=essencial&passo=3')
    const carregando = page.locator('[aria-busy="true"]')
    await expect(carregando).toBeVisible()
    const alturaCarregando = (await carregando.boundingBox())!.height
    expect(alturaCarregando).toBeGreaterThanOrEqual(200) // 13,5 rem = 216 px
    liberar()
    await expect(page.getByRole('radio', { name: '09:00' })).toBeVisible()
    const pronto = page
      .locator('[aria-busy="false"]')
      .filter({ has: page.getByRole('radio', { name: '09:00' }) })
    const alturaPronto = (await pronto.boundingBox())!.height
    expect(alturaPronto).toBeGreaterThanOrEqual(alturaCarregando - 1)
  })

  test('o esqueleto anuncia "Buscando horários" para o leitor de tela e some depois', async ({ page }) => {
    let liberar = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    await page.route(ROTA_HORARIOS, async (r) => {
      await espera
      await r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/agendar?combo=essencial&passo=3')
    await expect(page.getByText('Buscando horários livres.')).toBeAttached()
    liberar()
    await expect(page.getByText('Sem horário livre nesse dia.')).toBeVisible()
    await expect(page.getByText('Buscando horários livres.')).toHaveCount(0)
  })
})

test.describe('criar reserva', () => {
  async function ateARevisao(page: Page) {
    await ok(page)
    await page.goto('/agendar?combo=essencial&barbeiro=rafael')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.locator('label').filter({ has: page.getByRole('radio', { name: '09:00' }) }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel('Nome').fill('João Silva')
    await page.getByLabel('WhatsApp').fill('11999998888')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
  }

  test('500 ao confirmar: o botão "Tentar de novo" fica dentro do alerta e reenvia', async ({ page }) => {
    let chamadas = 0
    await page.route(ROTA_CRIAR, (r) => {
      chamadas++
      return chamadas === 1
        ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
        : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) })
    })
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    const alerta = page.getByRole('group', { name: /Sem conexão|Algo deu errado|aguardando/ })
    await expect(alerta).toContainText('Algo deu errado do nosso lado')
    await expect(alerta).toContainText('Seus dados continuam aqui.')
    await semErroTecnico(page)
    // Os dados continuam na revisão.
    await expect(page.getByText('João Silva')).toBeVisible()

    await alerta.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
    expect(chamadas).toBe(2)
  })

  test('durante o reenvio o alerta continua na tela e o botão mostra "Enviando"', async ({ page }) => {
    let chamadas = 0
    await page.route(ROTA_CRIAR, async (r) => {
      chamadas++
      if (chamadas === 1) {
        return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      }
      await new Promise((fim) => setTimeout(fim, 1200))
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) })
    })
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    const alerta = page.getByRole('group', { name: /Sem conexão|Algo deu errado|aguardando/ })
    await alerta.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(alerta.getByRole('button', { name: 'Enviando' })).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: 'Enviando seu agendamento.' })).toBeAttached()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(chamadas).toBe(2)
  })

  test('envio que demora mais de 15 s: avisa, oferece o WhatsApp e não aborta nem libera o botão', async ({ page }) => {
    let liberar = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    let chamadas = 0
    await page.route(ROTA_CRIAR, async (r) => {
      chamadas++
      await espera
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) })
    })
    await ateARevisao(page)
    // Relógio falso só daqui em diante: os 15 s não são esperados de verdade.
    await page.clock.install()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    const botao = page.getByRole('button', { name: 'Enviando' })
    await expect(botao).toBeDisabled()
    const status = page.getByRole('status').filter({ hasText: 'Enviando seu agendamento.' })

    await page.clock.fastForward(14_000)
    await expect(status.getByText('Ainda enviando')).toHaveCount(0)

    await page.clock.fastForward(2_000)
    await expect(status.getByText('Ainda enviando. Se demorar, confira no WhatsApp.')).toBeVisible()
    const wa = status.getByRole('link', { name: 'Chamar no WhatsApp' })
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
    await expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(wa).toHaveAttribute('target', '_blank')
    await expect(botao).toBeDisabled() // segue enviando: o botão continua travado
    await semErroTecnico(page)

    // O envio não foi abortado: quando o servidor responde, a reserva aparece (uma chamada só).
    await page.clock.resume()
    liberar()
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
    expect(chamadas).toBe(1)
  })

  test('envio rápido: o aviso de demora nunca aparece', async ({ page }) => {
    await page.route(ROTA_CRIAR, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVA) }),
    )
    await ateARevisao(page)
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    await expect(page.getByText('Ainda enviando')).toHaveCount(0)
  })
})

test('sem horário no último dia da janela e sem barbeiro: a saída é o WhatsApp', async ({ page }) => {
  await page.route(ROTA_HORARIOS, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.goto('/agendar?combo=essencial&passo=3')
  await expect(page.getByText('Sem horário livre nesse dia.')).toBeVisible()
  // Anda pelo atalho "Próximo dia aberto" até ele deixar de existir (último dia aberto da janela).
  for (let i = 0; i < 40; i++) {
    const proximo = page.getByRole('button', { name: /Próximo dia aberto/ })
    if ((await proximo.count()) === 0) break
    await proximo.click()
    await expect(page.getByText('Sem horário livre nesse dia.')).toBeVisible()
  }
  const link = page.getByRole('link', { name: 'Chamar no WhatsApp' })
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
  await expect(link).toHaveAttribute('rel', /noopener/)
})

test('rede fora ao abrir /agendar pela landing: aparece o aviso e recarregar abre a página', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Bloqueia só o arquivo da página /agendar (o código dela é baixado na hora do clique).
  await page.route('**/assets/Agendar-*.js', (r) => r.abort('failed'))
  await page.getByRole('link', { name: /agendar/i }).first().click()
  const alerta = page.getByRole('alert')
  await expect(alerta).toContainText('Algo deu errado ao abrir esta página. Tente de novo.')
  await semErroTecnico(page)

  await page.unroute('**/assets/Agendar-*.js')
  await alerta.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
})

test.describe('reserva expirada', () => {
  const guardar = (page: Page, salvoEm: number) =>
    page.addInitScript((quando) => {
      sessionStorage.setItem(
        'urbz:reserva-recente',
        JSON.stringify({
          codigo: 'K7M2PX',
          servico_nome: 'Essencial',
          barbeiro_nome: 'Rafael',
          inicio: new Date(Date.now() + 86_400_000).toISOString(),
          nome: 'Carlos',
          salvoEm: quando,
        }),
      )
    }, salvoEm)

  test('com mais de 2 horas: explica o prazo e oferece agendar ou falar no WhatsApp', async ({ page }) => {
    await guardar(page, Date.now() - 3 * 3_600_000)
    await page.goto('/agendar/sucesso')
    await expect(page.getByRole('heading', { name: 'Nenhuma reserva recente.' })).toBeVisible()
    await expect(page.getByText('guardada aqui por 2 horas')).toBeVisible()
    await expect(page.getByTestId('codigo')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Agendar um horário' })).toHaveAttribute('href', '/agendar')
    const wa = page.getByRole('link', { name: 'Falar no WhatsApp' })
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
    await expect(wa).toHaveAttribute('rel', /noopener noreferrer/)
    // O código vencido foi apagado do aparelho.
    expect(await page.evaluate(() => sessionStorage.getItem('urbz:reserva-recente'))).toBeNull()
    const { largura, visivel } = await page.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      visivel: document.documentElement.clientWidth,
    }))
    expect(largura).toBeLessThanOrEqual(visivel)
  })

  test('com menos de 2 horas a reserva ainda aparece', async ({ page }) => {
    await guardar(page, Date.now() - 3_600_000)
    await page.goto('/agendar/sucesso')
    await expect(page.getByTestId('codigo')).toHaveText('K7M2PX')
  })
})
