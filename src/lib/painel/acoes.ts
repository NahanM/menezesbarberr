// Quais ações o painel oferece sobre um agendamento. Função pura: sem React e sem rede.
// O banco é quem manda (o trigger valida a transição); aqui só decidimos o que MOSTRAR.
//   pendente   -> confirmar | cancelar
//   confirmado -> cancelar; e, a partir do início do atendimento, concluir | não compareceu
//   concluído, cancelado, não compareceu -> nada (são estados finais)
// O servidor não impede concluir ou marcar falta antes da hora; por decisão do projeto, o front esconde.

import type { StatusAgendamento } from './agenda.ts'

/**
 * Depois da pergunta de uma ação destrutiva (cancelar, faltou, remover bloqueio), o botão da 2ª etapa fica no
 * mesmo lugar do 1º. Sem esta trava, um duplo toque (ou um toque duplicado do dedo) confirmaria a ação sem
 * ninguém ter lido a pergunta.
 */
export const TRAVA_2A_ETAPA_MS = 400

export type IdAcao = 'confirmar' | 'cancelar' | 'concluir' | 'nao_compareceu'

export interface AcaoAgendamento {
  id: IdAcao
  /** Status que o agendamento passa a ter (o que vai para mudar_status). */
  destino: StatusAgendamento
  /** Texto do botão. */
  rotulo: string
  /** Nome para leitor de tela quando o texto sozinho é ambíguo ("Cancelar" também serve para fechar o diálogo); null = vale o texto. */
  nomeAcessivel: string | null
  /** Texto do botão na 2ª etapa, ou null se a ação executa no primeiro clique. */
  confirmacao: string | null
  /** A ação principal do momento: é a única que leva o neon. */
  principal: boolean
  /** Aparência de ação destrutiva (cancelar e faltou). */
  destrutiva: boolean
  /** Frase mostrada (aria-live) quando a ação dá certo. */
  sucesso: string
  /** Pergunta mostrada (aria-live) quando o botão pede a 2ª etapa. */
  pergunta: string | null
}

const CONFIRMAR: AcaoAgendamento = {
  id: 'confirmar',
  destino: 'confirmado',
  rotulo: 'Confirmar',
  nomeAcessivel: null,
  confirmacao: null,
  principal: true,
  destrutiva: false,
  sucesso: 'Agendamento confirmado.',
  pergunta: null,
}

const CONCLUIR: AcaoAgendamento = {
  id: 'concluir',
  destino: 'concluido',
  rotulo: 'Concluir',
  nomeAcessivel: null,
  confirmacao: null,
  principal: true,
  destrutiva: false,
  sucesso: 'Atendimento concluído.',
  pergunta: null,
}

const NAO_COMPARECEU: AcaoAgendamento = {
  id: 'nao_compareceu',
  destino: 'nao_compareceu',
  rotulo: 'Não compareceu',
  nomeAcessivel: null,
  confirmacao: 'Confirmar falta?',
  principal: false,
  destrutiva: true,
  sucesso: 'Marcado como não compareceu.',
  pergunta: 'Marcar que o cliente não compareceu? Toque de novo para confirmar.',
}

const CANCELAR: AcaoAgendamento = {
  id: 'cancelar',
  destino: 'cancelado',
  rotulo: 'Cancelar',
  nomeAcessivel: 'Cancelar agendamento',
  confirmacao: 'Confirmar cancelamento?',
  principal: false,
  destrutiva: true,
  sucesso: 'Agendamento cancelado. O horário ficou livre.',
  pergunta: 'Cancelar este agendamento? Toque de novo para confirmar.',
}

/**
 * Ações disponíveis, na ordem em que aparecem na tela (a principal primeiro).
 * `agora` e `inicio` entram só para o confirmado: concluir e faltar exigem que o atendimento já tenha começado.
 * Início ilegível (NaN) conta como "ainda não começou": na dúvida, esconde.
 */
export function acoesDisponiveis(
  status: StatusAgendamento,
  inicio: string,
  agora: number | Date,
): AcaoAgendamento[] {
  if (status === 'pendente') return [CONFIRMAR, CANCELAR]
  if (status === 'confirmado') {
    const jaComecou = Date.parse(inicio) <= (agora instanceof Date ? agora.getTime() : agora)
    return jaComecou ? [CONCLUIR, NAO_COMPARECEU, CANCELAR] : [CANCELAR]
  }
  return []
}
