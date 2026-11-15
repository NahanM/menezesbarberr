// Única porta de entrada do /agendar para o banco. As telas chamam estas funções
// e recebem sempre um resultado tipado: { ok: true, dados } ou { ok: false, erro }.
// Nenhuma delas lança exceção, então a tela só precisa checar `resultado.ok`.

import { normalizarErro, type ErroAgendar } from './erros.ts'
import type { DiaISO } from './datas.ts'

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroAgendar }

export interface AgendamentoCriado {
  codigo: string
  barbeiroNome: string
  /** Nomes juntos, ex.: "Corte + Sobrancelha". */
  servicoNome: string
  /** timestamptz em texto ISO. */
  inicio: string
  /** Soma dos preços, conferida pelo servidor. */
  precoTotalCentavos: number
  /** Soma das durações, conferida pelo servidor. */
  duracaoTotalMin: number
}

export interface NovoAgendamento {
  /** Um combo, OU um ou mais avulsos. O servidor valida a combinação (URB16). */
  servicosSlugs: string[]
  /** null = sem preferência (o servidor escolhe). */
  barbeiroSlug: string | null
  /** timestamptz em texto ISO, um dos horários devolvidos por buscarHorarios. */
  inicio: string
  nome: string
  /** O que o cliente digitou; o servidor aceita só dígitos (limpamos aqui). */
  telefone: string
  /**
   * Honeypot: o valor do campo invisível "website". Pessoa nunca preenche; robô sim. Vai para o servidor
   * como veio (o servidor decide). Fica fora de DadosCliente de propósito, para não entrar no rascunho.
   */
  website?: string
}

/**
 * Carrega o cliente do Supabase só quando precisa (import dinâmico). Assim a
 * landing e os testes de funções puras não exigem o .env, e o módulo pesado
 * fica fora do pacote inicial.
 */
async function carregarSupabase() {
  const { supabase } = await import('../supabase.ts')
  return supabase
}

/**
 * Quanto esperar pelos horários antes de desistir. Sem isso, uma conexão que trava (sinal fraco, rede
 * que não responde nem falha) deixaria o esqueleto na tela para sempre. Só a busca tem limite: ela não
 * grava nada, então repetir é seguro. A criação do agendamento não tem: abortar no meio poderia
 * deixar a reserva gravada no servidor sem a pessoa saber.
 */
export const LIMITE_BUSCA_HORARIOS_MS = 20_000

/** Horários livres (inícios, em ISO) para os serviços somados num dia, para um barbeiro ou para qualquer um. */
export async function buscarHorarios(
  servicosSlugs: string[],
  dia: DiaISO,
  barbeiroSlug: string | null,
): Promise<Resultado<string[]>> {
  const limite = new AbortController()
  const alarme = setTimeout(() => limite.abort(new Error('timeout')), LIMITE_BUSCA_HORARIOS_MS)
  try {
    const supabase = await carregarSupabase()
    const { data, error } = await supabase
      .rpc('horarios_disponiveis', {
        p_servicos: servicosSlugs,
        p_dia: dia,
        p_barbeiro: barbeiroSlug,
      })
      .abortSignal(limite.signal)
    if (error) return { ok: false, erro: normalizarErro(error) }
    return { ok: true, dados: (data ?? []).map((linha) => linha.inicio) }
  } catch (e) {
    return { ok: false, erro: normalizarErro(e) }
  } finally {
    clearTimeout(alarme)
  }
}

/** Grava o agendamento como pendente. O servidor valida tudo de novo. */
export async function criarAgendamento(
  novo: NovoAgendamento,
): Promise<Resultado<AgendamentoCriado>> {
  try {
    const supabase = await carregarSupabase()
    const { data, error } = await supabase.rpc('criar_agendamento', {
      p_servicos: novo.servicosSlugs,
      p_barbeiro: novo.barbeiroSlug,
      p_inicio: novo.inicio,
      p_nome: novo.nome.trim(),
      // Tira só a máscara (espaço, parênteses, +, hífen). Letras seguem para o servidor,
      // que responde URB04; com \D elas sumiriam e um telefone inválido passaria.
      p_telefone: novo.telefone.replace(/[\s()+-]/g, ''),
      p_website: novo.website ?? '',
    })
    if (error) return { ok: false, erro: normalizarErro(error) }

    // A função devolve uma lista com uma linha só.
    const linha = data?.[0]
    if (!linha) return { ok: false, erro: { codigo: 'DESCONHECIDO' } }
    return {
      ok: true,
      dados: {
        codigo: linha.codigo,
        barbeiroNome: linha.barbeiro_nome,
        servicoNome: linha.servico_nome,
        inicio: linha.inicio,
        precoTotalCentavos: linha.preco_total_centavos,
        duracaoTotalMin: linha.duracao_total_min,
      },
    }
  } catch (e) {
    return { ok: false, erro: normalizarErro(e) }
  }
}
