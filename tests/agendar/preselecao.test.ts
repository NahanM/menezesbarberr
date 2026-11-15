import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, it, expect } from 'vitest'
import { lerPreSelecao } from '../../src/lib/agendar/preselecao'

const ler = (q: string) => lerPreSelecao(new URLSearchParams(q))
const vazio = { combo: null, servico: null, barbeiro: null }

describe('preselecao', () => {
  it('slugs válidos', () => {
    expect(ler('combo=essencial&barbeiro=diego')).toEqual({ combo: 'essencial', servico: null, barbeiro: 'diego' })
    expect(ler('servico=barba')).toEqual({ combo: null, servico: 'barba', barbeiro: null })
    expect(ler('combo=cuidado-completo').combo).toBe('cuidado-completo')
  })
  it('ausentes e inválidos viram null', () => {
    expect(ler('')).toEqual(vazio)
    expect(ler('combo=nao-existe&servico=x&barbeiro=fulano')).toEqual(vazio)
    expect(ler('combo=&servico=&barbeiro=')).toEqual(vazio)
  })
  it('é sensível a maiúsculas e espaços', () => {
    expect(ler('combo=ESSENCIAL')).toEqual(vazio)
    expect(ler('combo=%20essencial')).toEqual(vazio)
  })
  it('combo e servico juntos: ambos lidos (a tela decide a precedência)', () => {
    expect(ler('combo=essencial&servico=barba')).toMatchObject({ combo: 'essencial', servico: 'barba' })
  })
  it('combo no lugar de servico (e vice-versa) é ignorado', () => {
    expect(ler('servico=essencial&combo=barba')).toEqual(vazio)
  })
  it('injeção na query nunca é repassada', () => {
    for (const p of [
      "essencial' OR '1'='1", '<script>alert(1)</script>', 'essencial;DROP TABLE agendamentos',
      '../../etc/passwd', '__proto__', 'constructor', 'toString',
    ]) {
      const sp = new URLSearchParams()
      sp.set('combo', p)
      sp.set('servico', p)
      sp.set('barbeiro', p)
      expect(lerPreSelecao(sp)).toEqual(vazio)
    }
  })
  it('parâmetro repetido: usa o primeiro', () => {
    expect(ler('combo=essencial&combo=x').combo).toBe('essencial')
    expect(ler('combo=x&combo=essencial').combo).toBeNull()
  })
})
