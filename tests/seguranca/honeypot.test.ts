// Honeypot (S4): robô que preenche o campo "website" não grava nada.
// Pedido válido em todos os campos, só com o honeypot preenchido: precisa dar URB20 e NÃO deixar
// linha no banco. A prova é uma consulta da equipe pelo telefone usado.
// Se a defesa falhasse, este teste criaria 1 agendamento (e o cancelaria no fim).
import { describe, it, expect, afterAll } from 'vitest'
import { clienteAnon, clienteEquipe, temEnvEquipe } from '../integracao/clientes'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const telefone = `11970${Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')}`

describe.skipIf(!temEnvEquipe)('honeypot não grava nada', () => {
  const criadosPorEngano: string[] = []

  afterAll(async () => {
    if (criadosPorEngano.length === 0) return
    const eq = await clienteEquipe()
    for (const id of criadosPorEngano) await eq.rpc('mudar_status', { p_id: id, p_status: 'cancelado' })
  }, 30000)

  it('pedido válido com website preenchido: URB20 e nenhuma linha para esse telefone', async () => {
    const anon = clienteAnon()
    // Um horário livre de verdade, para que só o honeypot possa impedir a gravação.
    let inicio: string | null = null
    for (let i = 5; i <= 20 && inicio === null; i++) {
      const { data } = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: somaDias(hoje(), i), p_barbeiro: null })
      inicio = (data as { inicio: string }[] | null)?.[0]?.inicio ?? null
    }
    expect(inicio).not.toBeNull()

    const { data, error } = await anon.rpc('criar_agendamento', {
      p_servicos: ['sobrancelha'], p_barbeiro: null, p_inicio: inicio, p_nome: 'Teste Robo Honeypot',
      p_telefone: telefone, p_website: 'https://spam.example',
    })
    expect(error?.code).toBe('URB20')
    expect(data).toBeNull()

    const eq = await clienteEquipe()
    const { data: linhas } = await eq.from('agendamentos').select('id').eq('cliente_telefone', `55${telefone}`)
    for (const l of linhas ?? []) criadosPorEngano.push((l as { id: string }).id)
    expect(linhas ?? []).toHaveLength(0)
  }, 30000)
})
