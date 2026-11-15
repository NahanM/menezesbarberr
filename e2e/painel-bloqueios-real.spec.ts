import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteEquipe, temEnvEquipe } from '../tests/integracao/clientes'
import { entrarNoPainel, estadoDoWorker } from './ajudas-login.ts'

// Bloqueios do painel contra o Supabase REAL (incremento 4.5). Sem simulação: cria um bloqueio PELA TELA num
// dia distante, confere no banco, remove PELA TELA em 2 etapas e confere de novo.
// O motivo sempre começa com "[E2E]" e o afterEach apaga qualquer bloqueio assim naquele dia, mesmo se o
// teste falhar no meio. Roda só no projeto "desktop" para gravar uma vez por execução.

const temConta = Boolean(process.env.E2E_EMAIL && process.env.E2E_SENHA)
const ESTADO = estadoDoWorker('painel')

test.skip(!temConta || !temEnvEquipe, 'E2E_EMAIL, E2E_SENHA e as chaves do Supabase não definidos no .env')
test.use({ storageState: ESTADO })

test.beforeAll(async ({ browser }, info) => {
  if (!temConta) return
  await entrarNoPainel(browser, info.project.use.baseURL, ESTADO)
})

const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
const aleatorio = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')

interface LinhaBloqueio {
  id: string
  motivo: string
  barbeiro_id: string | null
  inicio: string
  fim: string
}

let equipe: SupabaseClient | null = null
let diaUsado: string | null = null

const listar = async (dia: string) => {
  const { data, error } = await equipe!.rpc('listar_bloqueios', { p_de: dia, p_ate: dia })
  expect(error).toBeNull()
  return (data ?? []) as LinhaBloqueio[]
}

test.afterEach(async () => {
  // Rede de segurança: nenhum bloqueio "[E2E]" sobra no dia usado.
  if (!equipe || !diaUsado) return
  const { data } = await equipe.rpc('listar_bloqueios', { p_de: diaUsado, p_ate: diaUsado })
  for (const k of (data ?? []) as LinhaBloqueio[]) {
    if (k.motivo.startsWith('[E2E]')) await equipe.rpc('remover_bloqueio', { p_id: k.id })
  }
})

test('cria pela tela, vê no banco, remove pela tela em 2 etapas; termina sem bloqueio no banco', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'grava no banco real: uma vez só, no desktop')
  test.setTimeout(120_000)
  equipe = await clienteEquipe()

  // Terça a sexta, bem à frente, longe do que outros testes usam.
  let dia = somarDias(hojeEmSP(), 41)
  while (diaDaSemana(dia) < 2 || diaDaSemana(dia) > 5) dia = somarDias(dia, 1)
  diaUsado = dia
  expect(await listar(dia)).toEqual([]) // dia limpo antes de começar

  const motivo = `[E2E] Bloqueio ${aleatorio(5)}`
  await page.goto(`/painel?dia=${dia}`)
  await page.getByRole('button', { name: 'Bloquear horário' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Bloquear horário' })
  await expect(dialogo).toBeVisible()

  // Primeiro barbeiro de verdade (a lista vem do banco): opções 0 = "Escolha…", 1 = "Barbearia toda".
  const opcoes = dialogo.getByLabel('Quem').locator('option')
  await expect(opcoes).not.toHaveCount(2)
  const nomeBarbeiro = (await opcoes.nth(2).textContent())!
  await dialogo.getByLabel('Quem').selectOption({ index: 2 })
  await dialogo.getByLabel('Início', { exact: true }).fill('15:15')
  await dialogo.getByLabel('Fim', { exact: true }).fill('15:45')
  await dialogo.getByLabel(/^Motivo/).fill(motivo)
  await dialogo.getByRole('button', { name: 'Bloquear', exact: true }).click()
  await expect(dialogo).toBeHidden()

  // No banco: um bloqueio, com o horário de São Paulo certo (15:15 SP = 18:15Z) e o motivo.
  const criados = await listar(dia)
  expect(criados).toHaveLength(1)
  expect(criados[0].motivo).toBe(motivo)
  expect(criados[0].barbeiro_id).not.toBeNull()
  expect(new Date(criados[0].inicio).toISOString()).toBe(`${dia}T18:15:00.000Z`)
  expect(new Date(criados[0].fim).toISOString()).toBe(`${dia}T18:45:00.000Z`)

  // Na tela: aviso e bloco na grade.
  await expect(page.locator('[aria-live="polite"]', { hasText: 'Bloqueio criado' })).toContainText(nomeBarbeiro)
  const bloco = page.locator(`section[id^="coluna-"] button[aria-label*="${motivo}"]`)
  await expect(bloco).toHaveAttribute('aria-label', `Bloqueio, 15:15 – 15:45, ${nomeBarbeiro}: ${motivo}`)

  // Recarregar traz o mesmo bloqueio do banco (não era só estado da tela).
  await page.reload()
  await expect(bloco).toBeVisible()

  // Remover em 2 etapas: o 1º clique só pergunta.
  await bloco.click()
  const detalhes = page.getByRole('dialog', { name: 'Bloqueio' })
  await expect(detalhes.getByText(motivo)).toBeVisible()
  await detalhes.getByRole('button', { name: 'Remover bloqueio' }).click()
  expect(await listar(dia)).toHaveLength(1)
  await page.waitForTimeout(500)
  await detalhes.getByRole('button', { name: 'Confirmar remoção?' }).click()
  await expect(detalhes).toBeHidden()
  await expect(bloco).toHaveCount(0)
  await expect(page.locator('[aria-live="polite"]', { hasText: 'Bloqueio removido.' })).toBeVisible()
  expect(await listar(dia)).toEqual([])
})
