// Traduz o que dá errado ao criar ou remover um bloqueio em mensagem para quem atende.
// Códigos das funções criar_bloqueio e remover_bloqueio (ver as migrations do painel):
//   URB12  período inválido (fim não é depois do início, já terminou, ou passa de 14 dias)
//   URB13  motivo com mais de 120 caracteres
//   URB14  barbeiro não encontrado
//   URB15  bloqueio não encontrado (já foi removido)
//   42501  não é da equipe
// Mais sessão vencida (PostgREST) e falha de rede.
// Choque com agendamento NÃO é erro: a função cria o bloqueio e devolve quantos agendamentos
// ficaram dentro dele (ver avisoBloqueioCriado em bloqueio.ts).

import { normalizarErroStatus } from './erroStatus.ts'

export type CodigoErroBloqueio =
  | 'PERIODO'
  | 'MOTIVO'
  | 'BARBEIRO'
  | 'NAO_ENCONTRADO'
  | 'SEM_PERMISSAO'
  | 'SESSAO'
  | 'REDE'
  | 'DESCONHECIDO'

export function normalizarErroBloqueio(erro: unknown): CodigoErroBloqueio {
  const codigo =
    typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string' ? erro.code : ''

  if (codigo === 'URB12') return 'PERIODO'
  if (codigo === 'URB13') return 'MOTIVO'
  if (codigo === 'URB14') return 'BARBEIRO'
  if (codigo === 'URB15') return 'NAO_ENCONTRADO'

  // Permissão, sessão e rede já são classificadas para o status do agendamento: reaproveita.
  const geral = normalizarErroStatus(erro)
  if (geral === 'SEM_PERMISSAO' || geral === 'SESSAO' || geral === 'REDE') return geral
  return 'DESCONHECIDO'
}

const MENSAGENS: Record<CodigoErroBloqueio, string> = {
  PERIODO: 'Período inválido. O fim precisa ser depois do início e o bloqueio não pode já ter terminado.',
  MOTIVO: 'O motivo é longo demais. Use até 120 caracteres.',
  BARBEIRO: 'Esse barbeiro não existe mais. Atualizamos a agenda; escolha outro.',
  NAO_ENCONTRADO: 'Esse bloqueio já foi removido. Atualizamos a agenda.',
  SEM_PERMISSAO: 'Você não tem permissão para fazer isso.',
  SESSAO: 'Sua sessão expirou. Entre de novo para continuar.',
  REDE: 'Sem conexão. Confira a internet e tente de novo.',
  DESCONHECIDO: 'Não deu para salvar. Tente de novo.',
}

export function mensagemErroBloqueio(codigo: CodigoErroBloqueio): string {
  return MENSAGENS[codigo]
}

/** O erro indica que a agenda na tela está desatualizada: vale rebuscar. */
export function bloqueioDesatualizado(codigo: CodigoErroBloqueio): boolean {
  return codigo === 'NAO_ENCONTRADO' || codigo === 'BARBEIRO'
}
