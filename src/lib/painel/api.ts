// Porta de entrada do painel para o banco. Nenhuma função lança exceção:
// a tela só confere `resultado.ok`.

import { supabase } from '../supabase.ts'
import type { DiaISO } from '../agendar/datas.ts'
import type { Database } from '../supabase.types.ts'
import type { Agendamento, BarbeiroAtivo, Bloqueio } from './agenda.ts'
import type { PedidoBloqueio } from './bloqueio.ts'
import { normalizarErroBloqueio, type CodigoErroBloqueio } from './erroBloqueio.ts'
import { normalizarErroStatus, type CodigoErroStatus } from './erroStatus.ts'

export type ResultadoPainel<T> = { ok: true; dados: T } | { ok: false }

// mudar_status e listar_agenda devolvem as mesmas colunas; expirado_em é opcional só para facilitar testes e dados antigos.
type LinhaDaAgenda = Omit<Database['public']['Functions']['listar_agenda']['Returns'][number], 'expirado_em'> & {
  expirado_em?: string | null
}

/** Linha de listar_agenda / mudar_status (snake_case) -> Agendamento (camelCase). */
export function paraAgendamento(a: LinhaDaAgenda): Agendamento {
  return {
    id: a.id,
    codigo: a.codigo,
    status: a.status,
    inicio: a.inicio,
    fim: a.fim,
    barbeiroId: a.barbeiro_id,
    barbeiroNome: a.barbeiro_nome,
    servicoNome: a.servico_nome,
    servicoTipo: a.servico_tipo,
    clienteNome: a.cliente_nome,
    clienteTelefone: a.cliente_telefone,
    expiradoEm: a.expirado_em ?? null,
  }
}

export interface DadosDoPeriodo {
  barbeiros: BarbeiroAtivo[]
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
}

/**
 * Tudo que a agenda de um período (um dia, ou uma semana) precisa, em paralelo: barbeiros ativos
 * (tabela `barbeiros`, que a equipe pode ler), agendamentos (`listar_agenda`) e bloqueios
 * (`listar_bloqueios`). As duas funções aceitam até 31 dias por chamada.
 * Se qualquer uma das três falhar, o período inteiro falha: agenda pela metade engana quem atende.
 */
export async function buscarDadosDoPeriodo(de: DiaISO, ate: DiaISO): Promise<ResultadoPainel<DadosDoPeriodo>> {
  try {
    const [barbeiros, agenda, bloqueios] = await Promise.all([
      supabase.from('barbeiros').select('id, nome').eq('ativo', true).order('ordem').order('nome'),
      supabase.rpc('listar_agenda', { p_de: de, p_ate: ate }),
      supabase.rpc('listar_bloqueios', { p_de: de, p_ate: ate }),
    ])
    if (barbeiros.error || agenda.error || bloqueios.error) return { ok: false }

    return {
      ok: true,
      dados: {
        barbeiros: barbeiros.data.map((b) => ({ id: b.id, nome: b.nome })),
        agendamentos: (agenda.data ?? []).map(paraAgendamento),
        bloqueios: (bloqueios.data ?? []).map((k) => ({
          id: k.id,
          barbeiroId: k.barbeiro_id,
          barbeiroNome: k.barbeiro_nome,
          inicio: k.inicio,
          fim: k.fim,
          motivo: k.motivo,
        })),
      },
    }
  } catch {
    return { ok: false }
  }
}

export type ResultadoStatus = { ok: true; agendamento: Agendamento } | { ok: false; erro: CodigoErroStatus }

/**
 * Muda o status pela função mudar_status (só equipe). O servidor valida a transição e devolve a linha
 * atualizada. Nunca lança: o erro volta já classificado (transição inválida, sem permissão, rede...).
 */
export async function mudarStatus(id: string, status: Agendamento['status']): Promise<ResultadoStatus> {
  try {
    const { data, error } = await supabase.rpc('mudar_status', { p_id: id, p_status: status })
    if (error) return { ok: false, erro: normalizarErroStatus(error) }
    const linha = data?.[0]
    if (!linha) return { ok: false, erro: 'DESCONHECIDO' }
    const agendamento = paraAgendamento(linha)
    // O pendente já tinha vencido: o servidor o expirou em vez de aplicar a mudança pedida (exceto cancelar,
    // que dá no mesmo). Avisa a equipe; a agenda rebusca e passa a mostrar "Expirado".
    if (agendamento.expiradoEm != null && status !== 'cancelado') return { ok: false, erro: 'EXPIRADO' }
    return { ok: true, agendamento }
  } catch (erro) {
    return { ok: false, erro: normalizarErroStatus(erro) }
  }
}

export type ResultadoCriarBloqueio =
  | { ok: true; id: string; conflitos: number }
  | { ok: false; erro: CodigoErroBloqueio }

/**
 * Cria o bloqueio pela função criar_bloqueio (só equipe). Se já havia agendamento no período, ele fica
 * como está e `conflitos` diz quantos são. Nunca lança: o erro volta já classificado.
 */
export async function criarBloqueio(pedido: PedidoBloqueio): Promise<ResultadoCriarBloqueio> {
  try {
    const { data, error } = await supabase.rpc('criar_bloqueio', {
      p_barbeiro_id: pedido.barbeiroId,
      p_inicio: pedido.inicio,
      p_fim: pedido.fim,
      p_motivo: pedido.motivo,
    })
    if (error) return { ok: false, erro: normalizarErroBloqueio(error) }
    const linha = data?.[0]
    if (!linha) return { ok: false, erro: 'DESCONHECIDO' }
    return { ok: true, id: linha.id, conflitos: linha.conflitos }
  } catch (erro) {
    return { ok: false, erro: normalizarErroBloqueio(erro) }
  }
}

export type ResultadoRemoverBloqueio = { ok: true } | { ok: false; erro: CodigoErroBloqueio }

/** Remove o bloqueio pela função remover_bloqueio (só equipe). Nunca lança. */
export async function removerBloqueio(id: string): Promise<ResultadoRemoverBloqueio> {
  try {
    const { error } = await supabase.rpc('remover_bloqueio', { p_id: id })
    if (error) return { ok: false, erro: normalizarErroBloqueio(error) }
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: normalizarErroBloqueio(erro) }
  }
}
