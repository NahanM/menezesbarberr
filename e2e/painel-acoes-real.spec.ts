import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteAnon, clienteEquipe, temEnvEquipe } from '../tests/integracao/clientes'
import { entrarNoPainel, estadoDoWorker } from './ajudas-login.ts'

// Ações do painel contra o Supabase REAL (incremento 4.4). Sem simulação: cria um agendamento pela RPC
// pública criar_agendamento num dia distante, confirma e cancela PELA TELA e confere no banco.
// O agendamento SEMPRE termina cancelado (afterEach), mesmo se o teste falhar no meio.
// Roda só no projeto "desktop" para gravar uma vez por execução.

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

let equipe: SupabaseClient | null = null
let codigoCriado: string | null = null
let diaCriado: string | null = null

test.afterEach(async () => {
  // Rede de segurança: o que sobrou pendente ou confirmado vira cancelado. Não deixa lixo na agenda.
  if (!equipe || !codigoCriado || !diaCriado) return
  const { data } = await equipe.rpc('listar_agenda', { p_de: diaCriado, p_ate: diaCriado })
  const linha = data?.find((l: { codigo: string }) => l.codigo === codigoCriado)
  if (linha && linha.status !== 'cancelado' && ['pendente', 'confirmado'].includes(linha.status)) {
    await equipe.rpc('mudar_status', { p_id: linha.id, p_status: 'cancelado' })
  }
})

test('cria pela RPC pública, confirma e cancela pela tela; termina cancelado no banco', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'grava no banco real: uma vez só, no desktop')
  test.setTimeout(120_000)
  equipe = await clienteEquipe()
  const anon = clienteAnon()

  // Último horário livre de um dia útil (ter a sex) bem à frente na janela, longe do que outros testes usam.
  let alvo: { dia: string; inicio: string } | null = null
  for (let i = 28; i >= 10 && !alvo; i--) {
    const dia = somarDias(hojeEmSP(), i)
    if (diaDaSemana(dia) < 2 || diaDaSemana(dia) > 5) continue
    const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: null })
    const livres = (data ?? []) as { inicio: string }[]
    if (livres.length > 0) alvo = { dia, inicio: livres[livres.length - 1].inicio }
  }
  expect(alvo, 'sem horário livre na janela').not.toBeNull()

  // Prefixo fixo: facilita achar e limpar no painel do Supabase se algo sobrar.
  const nome = `[E2E] Painel ${aleatorio(5)}`
  const criado = await anon.rpc('criar_agendamento', {
    p_servicos: ['sobrancelha'],
    p_barbeiro: null,
    p_inicio: alvo!.inicio,
    p_nome: nome,
    p_telefone: `119${aleatorio(8)}`,
  })
  expect(criado.error).toBeNull()
  codigoCriado = (criado.data as { codigo: string }[])[0].codigo
  diaCriado = alvo!.dia

  const statusNoBanco = async () => {
    const { data } = await equipe!.rpc('listar_agenda', { p_de: diaCriado!, p_ate: diaCriado! })
    return (data as { codigo: string; status: string }[]).find((l) => l.codigo === codigoCriado)?.status
  }
  expect(await statusNoBanco()).toBe('pendente')

  await page.goto(`/painel?dia=${diaCriado}`)
  await page.locator(`section[id^="coluna-"] button[aria-label*="${nome}"]`).click()
  const dialogo = page.getByRole('dialog', { name: nome })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText(codigoCriado)).toBeVisible()

  // Pendente -> confirmado
  await dialogo.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(dialogo.getByRole('status')).toHaveText('Agendamento confirmado.')
  expect(await statusNoBanco()).toBe('confirmado')
  // Dia distante no futuro: confirmado só oferece cancelar (concluir e faltou ficam escondidos).
  await expect(dialogo.getByRole('button', { name: 'Concluir', exact: true })).toHaveCount(0)
  await expect(dialogo.getByRole('button', { name: 'Não compareceu', exact: true })).toHaveCount(0)

  // Confirmado -> cancelado, em duas etapas
  await dialogo.getByRole('button', { name: 'Cancelar agendamento', exact: true }).click()
  expect(await statusNoBanco()).toBe('confirmado') // o 1º clique só pergunta
  await dialogo.getByRole('button', { name: 'Confirmar cancelamento?' }).click()
  await expect(dialogo.getByRole('status')).toContainText('cancelado')
  expect(await statusNoBanco()).toBe('cancelado')

  // O bloco da grade reflete o cancelamento e a tela não oferece mais nada.
  // Desde o F9 o cancelado sai da grade por padrão: some, e com ?cancelados=1 volta marcado como cancelado.
  await page.keyboard.press('Escape')
  const blocoDoTeste = page.locator(`section[id^="coluna-"] button[aria-label*="${nome}"]`)
  await expect(blocoDoTeste).toHaveCount(0)
  await page.goto(`/painel?dia=${diaCriado}&cancelados=1`)
  await expect(blocoDoTeste).toHaveAttribute('aria-label', /Cancelado$/)
})
