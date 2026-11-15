import { vi } from 'vitest'

// Regra testada com o catálogo de teste (ver tests/_fixtures/barbearia-fixture.ts).
vi.mock('../../src/data/barbearia.ts', () => import('../_fixtures/barbearia-fixture.ts'))

import { describe, expect, it } from 'vitest'
import { diasSelecionaveis } from '../../src/lib/agendar/datas.ts'
import {
  estadoInicial,
  passoMaximo,
  passoResolvido,
  primeiroDiaAberto,
  proximoDiaAberto,
  reduzir,
  type EstadoAgendar,
} from '../../src/lib/agendar/estado.ts'

// Sexta 09/10/2026 12:00 em SP. Segunda e domingo são fechados; sábado abre.
const AGORA = new Date('2026-10-09T15:00:00Z')
const dias = diasSelecionaveis(AGORA, 30) // 09/10 ... 08/11 (domingo)

const vazio: EstadoAgendar = { servicos: [], barbeiro: null, dia: null, hora: null, horaPorConferir: false }
const completo: EstadoAgendar = {
  servicos: ['corte'],
  barbeiro: 'diego',
  dia: '2026-10-14',
  hora: '2026-10-14T12:00:00+00:00',
  horaPorConferir: false,
}

describe('proximoDiaAberto', () => {
  it('sábado pula domingo e segunda e cai na terça', () => {
    expect(proximoDiaAberto(dias, '2026-10-10')).toBe('2026-10-13')
  })
  it('sexta vai para o sábado (sábado abre)', () => {
    expect(proximoDiaAberto(dias, '2026-10-09')).toBe('2026-10-10')
  })
  it('véspera do fim da janela (sábado 07/11): só resta domingo fechado, então null', () => {
    expect(dias.at(-1)?.iso).toBe('2026-11-08')
    expect(dias.at(-1)?.fechado).toBe(true)
    expect(proximoDiaAberto(dias, '2026-11-07')).toBeNull()
  })
  it('último dia da janela e dia fora da lista: null', () => {
    expect(proximoDiaAberto(dias, '2026-11-08')).toBeNull()
    expect(proximoDiaAberto(dias, '2030-01-01')).toBeNull()
  })
  it('lista vazia: null', () => {
    expect(proximoDiaAberto([], '2026-10-10')).toBeNull()
  })
  it('é estritamente depois: não devolve o próprio dia', () => {
    expect(proximoDiaAberto(dias, '2026-10-13')).toBe('2026-10-14')
  })
})

describe('primeiroDiaAberto / estadoInicial', () => {
  it('hoje se abre', () => expect(primeiroDiaAberto(dias)).toBe('2026-10-09'))
  it('a partir de um domingo, pula para a terça', () => {
    const d = diasSelecionaveis(new Date('2026-10-11T15:00:00Z'), 5)
    expect(primeiroDiaAberto(d)).toBe('2026-10-13')
  })
  it('tudo fechado: null', () => {
    expect(primeiroDiaAberto(dias.map((d) => ({ ...d, fechado: true })))).toBeNull()
  })
  it('pré-seleção de avulso vira lista de um', () => {
    const e = estadoInicial({ combo: null, servico: 'barba', barbeiro: null }, dias)
    expect(e.servicos).toEqual(['barba'])
  })
  it('combo vence servico', () => {
    const e = estadoInicial({ combo: 'essencial', servico: 'barba', barbeiro: 'caio' }, dias)
    expect(e).toEqual({
      servicos: ['essencial'],
      barbeiro: 'caio',
      dia: '2026-10-09',
      hora: null,
      horaPorConferir: false,
    })
  })
  it('sem nada na URL', () => {
    const e = estadoInicial({ combo: null, servico: null, barbeiro: null }, dias)
    expect(e.servicos).toEqual([])
    expect(e.barbeiro).toBeNull()
  })
})

describe('reduzir', () => {
  it('alternar avulso novo soma na ordem do catálogo e marca a hora para conferir', () => {
    expect(reduzir(completo, { tipo: 'alternar-servico', slug: 'sobrancelha' })).toEqual({
      ...completo,
      servicos: ['corte', 'sobrancelha'],
      horaPorConferir: true,
    })
    const comBarba = { ...completo, servicos: ['sobrancelha'] }
    expect(reduzir(comBarba, { tipo: 'alternar-servico', slug: 'corte' }).servicos).toEqual([
      'corte',
      'sobrancelha',
    ])
  })
  it('alternar avulso já marcado desmarca e marca a hora para conferir', () => {
    const dois = { ...completo, servicos: ['corte', 'barba'] }
    expect(reduzir(dois, { tipo: 'alternar-servico', slug: 'corte' })).toEqual({
      ...dois,
      servicos: ['barba'],
      horaPorConferir: true,
    })
  })
  it('desmarcar o último avulso deixa a lista vazia', () => {
    expect(reduzir(completo, { tipo: 'alternar-servico', slug: 'corte' }).servicos).toEqual([])
  })
  it('escolher combo derruba os avulsos', () => {
    const dois = { ...completo, servicos: ['corte', 'barba'] }
    expect(reduzir(dois, { tipo: 'alternar-servico', slug: 'essencial' })).toEqual({
      ...dois,
      servicos: ['essencial'],
      horaPorConferir: true,
    })
  })
  it('escolher avulso derruba o combo', () => {
    const combo = { ...completo, servicos: ['essencial'] }
    expect(reduzir(combo, { tipo: 'alternar-servico', slug: 'barba' }).servicos).toEqual(['barba'])
  })
  it('escolher o combo já escolhido mantém o estado (mesma referência)', () => {
    const combo = { ...completo, servicos: ['essencial'] }
    expect(reduzir(combo, { tipo: 'alternar-servico', slug: 'essencial' })).toBe(combo)
  })
  it('além de 5 avulsos, o sexto é ignorado (mesma referência)', () => {
    const cinco = { ...completo, servicos: ['corte', 'barba', 'sobrancelha', 'limpeza-facial', 'hidratacao'] }
    expect(reduzir(cinco, { tipo: 'alternar-servico', slug: 'depilacao' })).toBe(cinco)
    // ...mas dá para desmarcar um.
    expect(reduzir(cinco, { tipo: 'alternar-servico', slug: 'barba' }).servicos).toHaveLength(4)
  })
  it('escolher-barbeiro novo mantém a hora e marca para conferir, inclusive para null (sem preferência)', () => {
    expect(reduzir(completo, { tipo: 'escolher-barbeiro', slug: null })).toEqual({
      ...completo,
      barbeiro: null,
      horaPorConferir: true,
    })
  })
  it('escolher-barbeiro igual mantém a hora', () => {
    expect(reduzir(completo, { tipo: 'escolher-barbeiro', slug: 'diego' })).toBe(completo)
    const semPref = { ...completo, barbeiro: null }
    expect(reduzir(semPref, { tipo: 'escolher-barbeiro', slug: null })).toBe(semPref)
  })
  it('escolher-dia novo limpa a hora; igual mantém', () => {
    expect(reduzir(completo, { tipo: 'escolher-dia', dia: '2026-10-15' })).toEqual({
      ...completo,
      dia: '2026-10-15',
      hora: null,
    })
    expect(reduzir(completo, { tipo: 'escolher-dia', dia: '2026-10-14' })).toBe(completo)
  })
  it('escolher-hora grava e não mexe no resto', () => {
    expect(reduzir(completo, { tipo: 'escolher-hora', hora: 'X' })).toEqual({ ...completo, hora: 'X' })
  })

  it('trocar serviço ou barbeiro SEM horário não marca nada para conferir', () => {
    const semHora = { ...completo, hora: null }
    expect(reduzir(semHora, { tipo: 'alternar-servico', slug: 'barba' }).horaPorConferir).toBe(false)
    expect(reduzir(semHora, { tipo: 'escolher-barbeiro', slug: null }).horaPorConferir).toBe(false)
  })
  it('escolher-dia e limpar-hora zeram o horário e a conferência pendente', () => {
    const pendente = { ...completo, horaPorConferir: true }
    expect(reduzir(pendente, { tipo: 'escolher-dia', dia: '2026-10-15' })).toMatchObject({
      hora: null,
      horaPorConferir: false,
    })
    expect(reduzir(pendente, { tipo: 'limpar-hora' })).toMatchObject({
      hora: null,
      horaPorConferir: false,
    })
  })
  it('escolher-hora nova encerra a conferência pendente', () => {
    const pendente = { ...completo, horaPorConferir: true }
    expect(reduzir(pendente, { tipo: 'escolher-hora', hora: 'Y' })).toMatchObject({
      hora: 'Y',
      horaPorConferir: false,
    })
  })
  it('hora-conferida mantém o horário e libera o fluxo; sem pendência devolve a mesma referência', () => {
    const pendente = { ...completo, horaPorConferir: true }
    expect(reduzir(pendente, { tipo: 'hora-conferida' })).toEqual(completo)
    expect(reduzir(completo, { tipo: 'hora-conferida' })).toBe(completo)
  })
  it('trocar o serviço e depois conferir mantém dia e horário', () => {
    const trocado = reduzir(completo, { tipo: 'alternar-servico', slug: 'barba' })
    expect(trocado).toMatchObject({ dia: completo.dia, hora: completo.hora })
    expect(reduzir(trocado, { tipo: 'hora-conferida' }).hora).toBe(completo.hora)
  })
  it('não muta o estado original', () => {
    const copia = structuredClone(completo)
    reduzir(completo, { tipo: 'escolher-dia', dia: '2026-10-20' })
    expect(completo).toEqual(copia)
  })
})

describe('passoMaximo', () => {
  it('sem serviço: 1', () => expect(passoMaximo(vazio)).toBe(1))
  it('com serviço, sem hora: 3', () => expect(passoMaximo({ ...vazio, servicos: ['corte'] })).toBe(3))
  it('hora sem dia: 3', () => {
    expect(passoMaximo({ ...completo, dia: null })).toBe(3)
  })
  it('tudo escolhido: 4', () => expect(passoMaximo(completo)).toBe(4))
  it('horário por conferir trava no passo 3, mesmo com dados válidos', () => {
    const pendente = { ...completo, horaPorConferir: true }
    expect(passoMaximo(pendente)).toBe(3)
    expect(passoMaximo(pendente, true)).toBe(3)
    expect(passoResolvido('5', pendente, 1, true)).toBe(3)
  })
})

describe('passoResolvido', () => {
  const comServico = { ...vazio, servicos: ['corte'] }
  it('sem ?passo usa o padrão', () => {
    expect(passoResolvido(null, comServico, 2)).toBe(2)
    expect(passoResolvido(null, vazio)).toBe(1)
  })
  it('padrão 2 sem serviço é limitado a 1', () => {
    expect(passoResolvido(null, vazio, 2)).toBe(1)
  })
  it('?passo respeitado dentro do limite', () => {
    expect(passoResolvido('3', comServico)).toBe(3)
    expect(passoResolvido('2', completo)).toBe(2)
  })
  it('?passo além do máximo é cortado', () => {
    expect(passoResolvido('3', vazio)).toBe(1)
    expect(passoResolvido('4', comServico)).toBe(3)
    expect(passoResolvido('5', completo)).toBe(4)
    expect(passoResolvido('99', completo)).toBe(4)
  })
  it('?passo 0, negativo: sobe para 1', () => {
    expect(passoResolvido('0', completo)).toBe(1)
    expect(passoResolvido('-3', completo)).toBe(1)
  })
  it('?passo lixo cai no padrão', () => {
    expect(passoResolvido('abc', completo, 2)).toBe(2)
    expect(passoResolvido('', completo, 2)).toBe(2)
    expect(passoResolvido('NaN', completo, 3)).toBe(3)
  })
  it('?passo decimal ou com sufixo usa parseInt', () => {
    expect(passoResolvido('2.9', completo)).toBe(2)
    expect(passoResolvido('3abc', completo)).toBe(3)
  })
})
