import { describe, it, expect, afterAll } from 'vitest'
import { clienteEquipe, temEnvEquipe } from '../integracao/clientes'
import { buscarHorarios, criarAgendamento } from '../../src/lib/agendar/api'
import { diasSelecionaveis } from '../../src/lib/agendar/datas'

// Dias abertos a partir de 3 dias à frente (passa da antecedência mínima com folga).
const aberto = diasSelecionaveis().filter((d, i) => !d.fechado && i >= 3)
const tel = () => `119${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}`

describe.skipIf(!temEnvEquipe)('api /agendar (remoto)', () => {
  const criados: string[] = []

  afterAll(async () => {
    const eq = await clienteEquipe()
    for (const codigo of criados) {
      const { data } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
      await eq.rpc('mudar_status', { p_id: data?.id, p_status: 'cancelado' })
    }
  }, 30000)

  it('buscarHorarios de combo em dia aberto devolve lista ok', async () => {
    const r = await buscarHorarios(['essencial'], aberto[0].iso, null)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Array.isArray(r.dados)).toBe(true)
      expect(r.dados.length).toBeGreaterThan(0)
    }
  }, 30000)

  it('slug inválido → URB01', async () => {
    const r = await buscarHorarios(['nao-existe'], aberto[0].iso, null)
    expect(r).toEqual({ ok: false, erro: { codigo: 'URB01' } })
  }, 30000)

  it('criarAgendamento em slot livre → ok com código', async () => {
    let r: Awaited<ReturnType<typeof criarAgendamento>> | undefined
    for (const dia of aberto) {
      const h = await buscarHorarios(['sobrancelha'], dia.iso, null)
      if (!h.ok || h.dados.length === 0) continue
      r = await criarAgendamento({
        servicosSlugs: ['sobrancelha'],
        barbeiroSlug: null,
        inicio: h.dados[h.dados.length - 1],
        nome: '  Teste QA  ',
        telefone: tel(),
      })
      break
    }
    expect(r?.ok).toBe(true)
    if (r?.ok) {
      criados.push(r.dados.codigo)
      expect(r.dados.codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
      expect(r.dados.servicoNome).toBe('Sobrancelha')
      expect(r.dados.precoTotalCentavos).toBe(1500)
      expect(r.dados.duracaoTotalMin).toBe(15)
      expect(r.dados.barbeiroNome).toBeTruthy()
    }
  }, 60000)
})
