// Expiração de pendentes (S2): quem pode executar o quê.
//   * expirar_pendentes() e _expirar_vencidos() não têm grant: só o pg_cron (dono do banco) executa.
//     Nem anon nem a equipe logada chamam pela API.
//   * teste_envelhecer_agendamento é só da equipe, e só mexe em cliente cujo nome começa com "Teste":
//     um cliente de verdade não pode ter o criado_em recuado.
import { describe, it, expect } from 'vitest'
import { clienteAnon, clienteEquipe, temEnvAnon, temEnvEquipe } from '../integracao/clientes'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const chamadas: [string, Record<string, unknown>][] = [
  ['expirar_pendentes', {}],
  ['_expirar_vencidos', { p_barbeiro_id: null, p_periodo: null }],
]

describe.skipIf(!temEnvAnon)('anon não executa a expiração', () => {
  const anon = clienteAnon()
  it.each(chamadas)('rpc %s falha para anon', async (fn, args) => {
    const { data, error } = await anon.rpc(fn, args)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('teste_envelhecer_agendamento falha para anon', async () => {
    const { data, error } = await anon.rpc('teste_envelhecer_agendamento', { p_codigo: 'ZZZZZZ', p_minutos: 5 })
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})

describe.skipIf(!temEnvEquipe)('authenticated (equipe) não executa a expiração', () => {
  it.each(chamadas)('rpc %s falha para quem está logado', async (fn, args) => {
    const eq = await clienteEquipe()
    const { data, error } = await eq.rpc(fn, args)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('teste_envelhecer_agendamento não mexe em cliente real (nome sem o prefixo "Teste")', async () => {
    const anon = clienteAnon()
    const eq = await clienteEquipe()
    let codigo: string | undefined
    for (let i = 20; i <= 30 && !codigo; i++) {
      const dia = somaDias(hoje(), i)
      const h = await anon.rpc('horarios_disponiveis', { p_servicos: ['sobrancelha'], p_dia: dia, p_barbeiro: 'caio' })
      for (const { inicio } of ((h.data ?? []) as { inicio: string }[]).reverse()) {
        const r = await anon.rpc('criar_agendamento', {
          p_servicos: ['sobrancelha'], p_barbeiro: 'caio', p_inicio: inicio,
          p_nome: 'Cliente Real', p_telefone: `117${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`,
        })
        codigo = (r.data as { codigo: string }[] | null)?.[0]?.codigo
        if (codigo) break
      }
    }
    expect(codigo).toBeDefined()
    try {
      const r = await eq.rpc('teste_envelhecer_agendamento', { p_codigo: codigo, p_minutos: 600 })
      expect(r.error).toBeNull()
      expect(r.data).toBe(0) // nenhuma linha alterada
    } finally {
      const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', codigo!).single()
      await eq.rpc('mudar_status', { p_id: ag?.id, p_status: 'cancelado' })
    }
  }, 60000)
})
