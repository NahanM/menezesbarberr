import { expect, test, type Page } from '@playwright/test'
import { clienteEquipe, temEnvEquipe } from '../tests/integracao/clientes.ts'

// QA da edição pela revisão e do rascunho: o que o dev não cobriu em agendar-edicao.spec.ts.
// Fluxo real contra o banco remoto (cancela no afterEach), rascunho vencido por relógio,
// storage corrompido, limpeza após sucesso e uso só com teclado.

const ROTA_HORARIOS = '**/rest/v1/rpc/horarios_disponiveis*'
const ROTA_CRIAR = '**/rest/v1/rpc/criar_agendamento*'
const CHAVE = 'urbz:agendar-rascunho'

interface CorpoHorarios {
  p_servicos: string[]
  p_dia: string
}

async function mockHorarios(page: Page, livres: (c: CorpoHorarios) => string[] = () => ['12:00', '12:30']) {
  await page.route(ROTA_HORARIOS, (rota) => {
    const c = rota.request().postDataJSON() as CorpoHorarios
    return rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(livres(c).map((h) => ({ inicio: `${c.p_dia}T${h}:00+00:00` }))),
    })
  })
}

async function mockCriar(page: Page) {
  await page.route(ROTA_CRIAR, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          codigo: 'K7M2PX',
          barbeiro_nome: 'Rafael',
          servico_nome: 'Essencial',
          preco_total_centavos: 8000,
          duracao_total_min: 60,
          inicio: '2026-10-14T12:00:00+00:00',
        },
      ]),
    }),
  )
}

const botao = (page: Page) => page.getByTestId('barra-acao').getByRole('button')

async function marcar(page: Page, papel: 'radio' | 'checkbox', nome: string | RegExp) {
  await page.locator('label').filter({ has: page.getByRole(papel, { name: nome }) }).click()
}

async function preencher(page: Page, nome: string, tel: string) {
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('WhatsApp').fill(tel)
}

async function ateARevisaoMock(page: Page) {
  await page.goto('/agendar?combo=essencial&barbeiro=rafael')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.locator('label:has(input[name="dia"]:not([disabled]))').nth(3).click()
  await marcar(page, 'radio', '09:00')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await preencher(page, 'João Silva', '11999998888')
  await page.getByRole('button', { name: 'Revisar' }).click()
  await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
}

const lerRascunho = (page: Page) =>
  page.evaluate((k) => sessionStorage.getItem(k), CHAVE)

test.describe('rascunho: validade, lixo e limpeza', () => {
  test('vencido pelo relógio (31 min depois) começa limpo e apaga os dados pessoais', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisaoMock(page)
    expect(await lerRascunho(page)).toContain('João Silva')

    // O relógio da próxima carga anda 31 minutos.
    await page.addInitScript(() => {
      const agora = Date.now.bind(Date)
      Date.now = () => agora() + 31 * 60 * 1000
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await expect(botao(page)).toBeDisabled()
    expect(await lerRascunho(page)).not.toContain('João Silva')
    expect(await lerRascunho(page)).not.toContain('11999998888')
  })

  test('29 min depois ainda vale', async ({ page }) => {
    await mockHorarios(page)
    await ateARevisaoMock(page)
    await page.addInitScript(() => {
      const agora = Date.now.bind(Date)
      Date.now = () => agora() + 29 * 60 * 1000
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await expect(page.getByText('João Silva')).toBeVisible()
  })

  test('storage corrompido ou malicioso não quebra a página', async ({ page }) => {
    await mockHorarios(page)
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(e.message))
    await page.goto('/agendar')
    const futuro = Date.now() + 10 * 60 * 1000
    const lixos = [
      'não é json',
      'null',
      '[]',
      '42',
      '{"salvoEm":"x"}',
      JSON.stringify({ salvoEm: futuro, estado: { servicos: ['essencial'] }, dados: { nome: 'a', telefone: 'b' } }),
      JSON.stringify({ salvoEm: Date.now(), estado: { servicos: ['essencial', 'corte'], barbeiro: null, dia: null, hora: null }, dados: { nome: 'a', telefone: 'b' } }),
      JSON.stringify({ salvoEm: Date.now(), estado: { servicos: ['__proto__'], barbeiro: 'x', dia: '2020-01-01', hora: 'ontem' }, dados: { nome: 1, telefone: 2 } }),
      JSON.stringify({ salvoEm: Date.now(), estado: { servicos: ['corte'], barbeiro: 'hacker', dia: null, hora: null }, dados: { nome: 'a', telefone: 'b' } }),
    ]
    for (const lixo of lixos) {
      await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [CHAVE, lixo])
      await page.goto('/agendar?passo=5')
      await expect(page.getByRole('heading', { name: 'O que vai ser?' }), lixo).toBeVisible()
      await expect(page.locator('input:checked')).toHaveCount(0)
    }
    expect(erros).toEqual([])
  })

  test('storage com texto gigante é cortado (nome 80, telefone 20)', async ({ page }) => {
    await mockHorarios(page)
    await page.goto('/agendar')
    await page.evaluate(
      ([k]) =>
        sessionStorage.setItem(
          k,
          JSON.stringify({
            salvoEm: Date.now(),
            estado: { servicos: ['corte'], barbeiro: null, dia: null, hora: null, horaPorConferir: false },
            dados: { nome: 'N'.repeat(5000), telefone: '9'.repeat(5000) },
          }),
        ),
      [CHAVE],
    )
    await page.goto('/agendar?passo=4')
    // Sem dia/hora válidos o fluxo para no passo 3. Restaurar não regrava (a validade não anda);
    // os dados cortados vão para o storage na primeira alteração, aqui trocar o dia.
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    await page.locator('label:has(input[name="dia"]:not([disabled]))').nth(1).click()
    const salvo = JSON.parse((await lerRascunho(page)) ?? '{}') as { dados: { nome: string; telefone: string } }
    expect(salvo.dados.nome.length).toBeLessThanOrEqual(80)
    expect(salvo.dados.telefone.length).toBeLessThanOrEqual(20)
  })

  test('depois do sucesso, /agendar e /agendar?passo=5 começam limpos', async ({ page }) => {
    await mockHorarios(page)
    await mockCriar(page)
    await ateARevisaoMock(page)
    await botao(page).click()
    await expect(page.getByTestId('codigo')).toBeVisible()
    expect(await lerRascunho(page)).toBeNull()

    await page.goto('/agendar?passo=5')
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    await expect(page.locator('input:checked')).toHaveCount(0)
    await page.goto('/agendar?passo=4')
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()
    expect(await lerRascunho(page)).toBeNull()
  })
})

test.describe('teclado', () => {
  /** Aperta Tab até o elemento focado satisfazer o teste (máx. 80). */
  async function tabAte(page: Page, css: string, texto: RegExp) {
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab')
      const ok = await page.evaluate(
        ([c, t]) => {
          const el = document.activeElement
          if (!el || !el.matches(c)) return false
          const rotulo = el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? el.textContent ?? ''
          return new RegExp(t, 'i').test(rotulo)
        },
        [css, texto.source],
      )
      if (ok) return
    }
    throw new Error(`Tab não chegou em ${css} ${texto}`)
  }

  test('Editar, mudar e Voltar à revisão só com teclado; aviso anunciado como alert', async ({ page }) => {
    // O Cuidado Completo perde o 09:00.
    await mockHorarios(page, (c) => (c.p_servicos.includes('cuidado-completo') ? ['12:30'] : ['12:00', '12:30']))
    await ateARevisaoMock(page)

    await page.getByRole('button', { name: 'Editar serviço' }).focus() // ponto de partida; o resto é Tab/teclas
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'O que vai ser?' })).toBeVisible()

    await tabAte(page, 'input[type="radio"]', /Essencial/)
    await page.keyboard.press('ArrowDown') // radio nativo: seleciona o próximo combo
    await expect(page.getByRole('radio', { name: /Cuidado Completo/ })).toBeChecked()

    await tabAte(page, 'button', /Voltar à revisão/)
    await page.keyboard.press('Enter')

    // O 09:00 não cabe: aviso numa região aria-live assertiva e passo 3.
    await expect(page.getByRole('heading', { name: 'Dia e hora' })).toBeVisible()
    const aviso = page.getByTestId('aviso-horario').filter({ hasText: 'Esse horário não cabe mais' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toHaveText('Esse horário não cabe mais com a nova escolha. Escolha outro.')

    await tabAte(page, 'input[name="horario"]', /09:30/)
    await page.keyboard.press('Space')
    await expect(page.getByRole('radio', { name: '09:30' })).toBeChecked()
    await tabAte(page, 'button', /Voltar à revisão/)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()
    await expect(page.getByText(/09:30/).first()).toBeVisible()
  })
})

test.describe('contra o banco real', () => {
  test.skip(!temEnvEquipe, 'precisa de VITE_SUPABASE_*, E2E_EMAIL e E2E_SENHA no .env')

  const criados: string[] = []
  test.afterEach(async () => {
    const equipe = await clienteEquipe()
    for (const codigo of criados.splice(0)) {
      const { data } = await equipe.from('agendamentos').select('id').eq('codigo', codigo).single()
      if (data) await equipe.rpc('mudar_status', { p_id: data.id, p_status: 'cancelado' })
    }
  })

  test('combo -> edita para Corte + Sobrancelha -> confirma -> listar_agenda mostra nome e horário', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/agendar?combo=essencial')
    await page.getByRole('button', { name: 'Continuar' }).click() // barbeiro: sem preferência
    const horario = page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first()
    for (let i = 0; i < 6; i++) {
      const proximo = page.getByRole('button', { name: /Próximo dia aberto/ })
      await expect(horario.or(proximo)).toBeVisible({ timeout: 15_000 })
      if (await horario.isVisible()) break
      await proximo.click()
    }
    await expect(horario).toBeVisible()
    await page.locator('label:has(input[name="horario"])').first().click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await preencher(page, 'Teste QA Edicao', '11988880002')
    await page.getByRole('button', { name: 'Revisar' }).click()
    await expect(page.getByRole('heading', { name: 'Confere aí' })).toBeVisible()

    const antes = JSON.parse((await lerRascunho(page)) ?? '{}') as { estado: { dia: string; hora: string } }
    const horaEscolhida = antes.estado.hora

    await page.getByRole('button', { name: /Editar serviço/ }).click()
    await marcar(page, 'checkbox', /^Corte/)
    await marcar(page, 'checkbox', /^Sobrancelha/)
    await expect(botao(page)).toHaveText('Voltar à revisão')
    await botao(page).click()

    // O passo 3 confere o horário: ou volta sozinho à revisão, ou mostra o aviso e fica no passo 3.
    const revisao = page.getByRole('heading', { name: 'Confere aí' })
    const aviso = page.getByTestId('aviso-horario').getByText('Esse horário não cabe mais')
    await expect(revisao.or(aviso)).toBeVisible({ timeout: 15_000 })
    let horaFinal = horaEscolhida
    if (await aviso.isVisible()) {
      await page.locator('label:has(input[name="horario"])').first().click()
      await botao(page).click()
      await expect(revisao).toBeVisible()
      const dep = JSON.parse((await lerRascunho(page)) ?? '{}') as { estado: { hora: string } }
      horaFinal = dep.estado.hora
    }
    await expect(page.locator('dl > div').filter({ hasText: 'Serviços' }).locator('dd').first()).toHaveText(
      'Corte + Sobrancelha',
    )

    await botao(page).click() // Confirmar
    const codigo = page.getByTestId('codigo')
    await expect(codigo).toBeVisible({ timeout: 20_000 })
    const texto = ((await codigo.textContent()) ?? '').trim()
    criados.push(texto)

    const equipe = await clienteEquipe()
    const { data: ag } = await equipe.from('agendamentos').select('id').eq('codigo', texto).single()
    expect(ag).not.toBeNull()
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(horaFinal))
    const lista = await equipe.rpc('listar_agenda', { p_de: dia, p_ate: dia })
    expect(lista.error).toBeNull()
    const meu = (lista.data as { id: string; servico_nome: string; inicio: string; fim: string }[]).find(
      (a) => a.id === ag!.id,
    )
    expect(meu?.servico_nome).toBe('Corte + Sobrancelha')
    expect(Date.parse(meu!.inicio)).toBe(Date.parse(horaFinal))
    expect(Date.parse(meu!.fim) - Date.parse(meu!.inicio)).toBe(55 * 60_000)
  })
})
