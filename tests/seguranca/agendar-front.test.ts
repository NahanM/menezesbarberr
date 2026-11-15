// Portão de segurança da Fase 3: o /agendar visto por um atacante.
// - criar_agendamento chamado PELO CÓDIGO DO FRONT (src/lib/agendar/api.ts), com os mesmos parâmetros.
// - O que volta do servidor (nome com HTML) renderizado pela tela de sucesso: precisa sair como texto.
// - Link wa.me: o nome não pode trocar o destino nem injetar parâmetros.
// - Query string (?combo, ?servico, ?barbeiro, ?passo) e sessionStorage: entrada não confiável.
// Tudo que for criado no remoto é cancelado um a um no afterAll, com a sessão da equipe.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteEquipe, temEnvEquipe } from '../integracao/clientes'
import { buscarHorarios, criarAgendamento } from '../../src/lib/agendar/api'
import { linkConfirmacao, mensagemWhatsApp } from '../../src/lib/agendar/mensagem'
import { lerPreSelecao } from '../../src/lib/agendar/preselecao'
import { estadoInicial, passoResolvido } from '../../src/lib/agendar/estado'
import { ehReservaRecente } from '../../src/lib/agendar/reserva'
import Sucesso from '../../src/components/agendar/Sucesso'

const log = (titulo: string, r: unknown) => console.log(`[seguranca-f3] ${titulo}: ${JSON.stringify(r)}`)

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoje = () => fmt.format(new Date())
function somaDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()
/** Telefone mascarado como o campo do front entrega: "(11) 9xxxx-xxxx". */
const telMascarado = () => {
  const d = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')
  return `(11) 9${d.slice(0, 4)}-${d.slice(4)}`
}

/** Nada que o NOME malicioso poderia criar. A foto legítima da página (<img> com src próprio) é permitida. */
function semElementosInjetados(html: string) {
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/<svg[^>]*onload/i)
  expect(html).not.toMatch(/<img[^>]*(src="?x"?[\s>]|onerror)/i)
  expect(html).not.toMatch(/<[^>]*\sonerror=/i)
  expect(html).not.toMatch(/<(b|i)>/i)
}
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const XSS = [
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
]

function renderSucesso(nome: string, extra: Partial<{ servico: string; barbeiro: string; codigo: string }> = {}) {
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(Sucesso, {
        codigo: extra.codigo ?? 'ABC123',
        servico: extra.servico ?? 'Sobrancelha',
        barbeiro: extra.barbeiro ?? 'Rafael',
        inicio: '2030-01-08T13:00:00.000Z',
        nome,
      }),
    ),
  )
}

describe('front: entrada não confiável (sem rede)', () => {
  it.each(XSS)('tela de sucesso renderiza %s como texto', (nome) => {
    const html = renderSucesso(nome, { servico: '<b>x</b>', barbeiro: '<script>alert(1)</script>', codigo: '<i>C</i>' })
    semElementosInjetados(html)
    expect(html).toContain(escapar(nome))
  })

  it('link wa.me: nome não troca destino nem injeta parâmetro', () => {
    const nome = 'Ana&phone=5599999999999#x\nOi?text=hack /../evil.com'
    const d = { servico: 'Sobrancelha', barbeiro: 'Rafael', inicio: '2030-01-08T13:00:00.000Z', nome, codigo: 'ABC123' }
    const u = new URL(linkConfirmacao(d))
    expect(u.protocol).toBe('https:')
    expect(u.host).toBe('wa.me')
    expect(u.pathname).toBe('/5511900000000')
    expect([...u.searchParams.keys()]).toEqual(['text'])
    expect(u.searchParams.get('text')).toBe(mensagemWhatsApp(d))
    expect(u.hash).toBe('')
  })

  it('?combo/?servico/?barbeiro maliciosos são ignorados', () => {
    const p = new URLSearchParams()
    p.set('combo', 'javascript:alert(1)')
    p.set('servico', '__proto__')
    p.set('barbeiro', 'constructor')
    expect(lerPreSelecao(p)).toEqual({ combo: null, servico: null, barbeiro: null })
    const q = new URLSearchParams('servico=toString&barbeiro=%3Cscript%3E&combo=https://evil.com')
    expect(lerPreSelecao(q)).toEqual({ combo: null, servico: null, barbeiro: null })
  })

  it('?passo não pula etapas nem sai da faixa 1..5', () => {
    const vazio = estadoInicial({ combo: null, servico: null, barbeiro: null }, [])
    for (const p of ['5', '999', '-3', '1e9', 'NaN', '<script>', '4.9', '0x5']) {
      expect(passoResolvido(p, vazio, 1, false)).toBe(1)
    }
    const completo = { servicos: ['sobrancelha'], barbeiro: null, dia: '2030-01-08', hora: '2030-01-08T13:00:00Z', horaPorConferir: false }
    // Sem dados válidos, a revisão (5) não abre mesmo pedindo pela URL.
    expect(passoResolvido('5', completo, 1, false)).toBe(4)
    expect(passoResolvido('99', completo, 1, true)).toBe(5)
  })

  it('sessionStorage adulterado: formato errado é rejeitado; __proto__ não polui', () => {
    expect(ehReservaRecente(JSON.parse('{"codigo":1}'))).toBe(false)
    expect(ehReservaRecente(JSON.parse('{"codigo":"a","servico_nome":"b","barbeiro_nome":"c","inicio":"não é data","nome":"x"}'))).toBe(false)
    const poluido = JSON.parse('{"__proto__":{"polluted":true},"codigo":"a","servico_nome":"b","barbeiro_nome":"c","inicio":"2030-01-01T10:00:00Z","nome":"<img src=x onerror=alert(1)>"}')
    ehReservaRecente(poluido)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe.skipIf(!temEnvEquipe)('remoto: criar_agendamento pelo código do front', () => {
  let eq: SupabaseClient
  const criados: string[] = []

  async function slotLivre(pular = 0): Promise<string> {
    let vistos = 0
    for (let i = 28; i >= 7; i--) {
      const dia = somaDias(hoje(), i)
      if (dow(dia) < 2 || dow(dia) > 5) continue
      const r = await buscarHorarios(['sobrancelha'], dia, null)
      if (r.ok && r.dados.length && vistos++ >= pular) return r.dados[r.dados.length - 2] ?? r.dados[0]
    }
    throw new Error('sem horário livre')
  }

  async function agendar(o: { nome?: string; telefone?: string; inicio: string; barbeiro?: string | null; servico?: string }) {
    const r = await criarAgendamento({
      servicosSlugs: [o.servico ?? 'sobrancelha'],
      barbeiroSlug: o.barbeiro === undefined ? null : o.barbeiro,
      inicio: o.inicio,
      nome: o.nome ?? 'Teste Seguranca',
      telefone: o.telefone ?? telMascarado(),
    })
    if (r.ok) criados.push(r.dados.codigo)
    return r
  }

  beforeAll(async () => {
    eq = await clienteEquipe()
  }, 30000)

  afterAll(async () => {
    let falhas = 0
    for (const codigo of criados) {
      const { data: ag } = await eq.from('agendamentos').select('id').eq('codigo', codigo).single()
      const { error } = await eq.rpc('mudar_status', { p_id: ag?.id, p_status: 'cancelado' })
      if (error) falhas++
    }
    console.log(`[seguranca-f3] limpeza: ${criados.length - falhas} cancelados, ${falhas} falhas`)
  }, 30000)

  it('nome com 5.000 caracteres: URB03', async () => {
    const r = await agendar({ inicio: await slotLivre(), nome: 'A'.repeat(5000) })
    log('nome 5000', r.ok ? 'GRAVOU' : r.erro)
    expect(r.ok ? null : r.erro.codigo).toBe('URB03')
  })

  it('telefone com letras (máscara do front tira só espaço/parênteses/+/-): URB04', async () => {
    const inicio = await slotLivre()
    for (const t of ['(11) 9abcd-9999', '11999999999x', "11999999999' or '1'='1"]) {
      const r = await agendar({ inicio, telefone: t })
      expect(r.ok ? null : r.erro.codigo).toBe('URB04')
    }
  })

  it('data no passado: URB05', async () => {
    let dia = somaDias(hoje(), -7)
    while (dow(dia) !== 2) dia = somaDias(dia, -1)
    const r = await agendar({ inicio: `${dia}T13:00:00.000Z` })
    expect(r.ok ? null : r.erro.codigo).toBe('URB05')
  })

  it('barbeiro inexistente: URB02', async () => {
    const r = await agendar({ inicio: await slotLivre(), barbeiro: 'joao-inexistente' })
    expect(r.ok ? null : r.erro.codigo).toBe('URB02')
  })

  it('HTML/JS no nome: gravado literal e a tela de sucesso mostra como texto', async () => {
    const nome = '<img src=x onerror=alert(1)>Ana'
    const r = await agendar({ inicio: await slotLivre(1), nome })
    log('nome HTML pelo front', r.ok ? { codigo: r.dados.codigo } : r.erro)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const html = renderSucesso(nome, { servico: r.dados.servicoNome, barbeiro: r.dados.barbeiroNome, codigo: r.dados.codigo })
    semElementosInjetados(html)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Ana')
    const u = new URL(linkConfirmacao({ servico: r.dados.servicoNome, barbeiro: r.dados.barbeiroNome, inicio: r.dados.inicio, nome, codigo: r.dados.codigo }))
    expect(u.host).toBe('wa.me')
    expect(u.searchParams.get('text')).toContain(`Nome: ${nome}.`)
  }, 30000)
})
