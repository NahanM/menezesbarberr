// Traduz o que dá errado ao mudar o status em mensagem para quem atende.
// Códigos que a função mudar_status pode devolver (ver a migration das funções do painel):
//   42501  não é da equipe          URB11  agendamento não encontrado
//   23514  transição inválida (trigger)
//   URB17  concluir / faltar antes do início do atendimento (trigger)
// Mais os de sessão vencida (PostgREST) e os de rede (reaproveita normalizarErro do /agendar).

import { normalizarErro } from '../agendar/erros.ts'

export type CodigoErroStatus =
  | 'TRANSICAO' // o status atual não permite esse passo (alguém já mexeu)
  | 'AINDA_NAO_COMECOU' // concluir ou faltar antes da hora
  | 'EXPIRADO' // o pendente venceu antes da ação; o servidor o expirou e não aplicou a mudança
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'SESSAO' // token vencido
  | 'REDE'
  | 'DESCONHECIDO'

export function normalizarErroStatus(erro: unknown): CodigoErroStatus {
  const objeto: { code?: unknown; message?: unknown } = typeof erro === 'object' && erro !== null ? erro : {}
  const codigo = typeof objeto.code === 'string' ? objeto.code : ''
  const texto = typeof objeto.message === 'string' ? objeto.message : ''

  if (codigo === '23514' || /transição de status inválida/i.test(texto)) return 'TRANSICAO'
  if (codigo === 'URB17') return 'AINDA_NAO_COMECOU'
  if (codigo === '42501') return 'SEM_PERMISSAO'
  if (codigo === 'URB11') return 'NAO_ENCONTRADO'
  if (codigo === 'PGRST301' || codigo === 'PGRST303' || /jwt/i.test(texto)) return 'SESSAO'
  if (normalizarErro(erro).codigo === 'REDE') return 'REDE'
  return 'DESCONHECIDO'
}

const MENSAGENS: Record<CodigoErroStatus, string> = {
  TRANSICAO: 'Esse agendamento já mudou de status. Atualizamos a agenda; confira e tente de novo.',
  EXPIRADO: 'Esse pedido expirou: passou do prazo sem confirmação. Atualizamos a agenda; o horário já está livre.',
  AINDA_NAO_COMECOU: 'Esse atendimento ainda não começou. Só dá para concluir ou marcar falta depois do horário.',
  SEM_PERMISSAO: 'Você não tem permissão para fazer isso.',
  NAO_ENCONTRADO: 'Não achamos esse agendamento. Atualizamos a agenda.',
  SESSAO: 'Sua sessão expirou. Entre de novo para continuar.',
  REDE: 'Sem conexão. Confira a internet e tente de novo.',
  DESCONHECIDO: 'Não deu para salvar. Tente de novo.',
}

export function mensagemErroStatus(codigo: CodigoErroStatus): string {
  return MENSAGENS[codigo]
}

/** O erro indica que a agenda na tela está desatualizada: vale rebuscar. */
export function agendaDesatualizada(codigo: CodigoErroStatus): boolean {
  return codigo === 'TRANSICAO' || codigo === 'NAO_ENCONTRADO' || codigo === 'EXPIRADO'
}
