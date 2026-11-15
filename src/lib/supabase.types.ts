// Tipos escritos à mão das funções (RPC) que o front chama.
// Servem para o TypeScript conferir nomes e tipos dos argumentos e do retorno.
// Quando uma função nova do banco for usada no front (ex.: no painel), declare-a aqui.
// Única tabela lida direto: `barbeiros` (só a equipe logada, pela policy "equipe le barbeiros"), para o
// painel montar uma coluna por barbeiro ativo. Todo o resto passa por funções.

export interface Database {
  public: {
    Tables: {
      barbeiros: {
        Row: { id: string; nome: string; ordem: number; ativo: boolean }
        // Só leitura: o front nunca insere nem altera barbeiro.
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      /** Painel: true se quem está logado consta na tabela `equipe`. */
      is_equipe: {
        Args: Record<string, never>
        Returns: boolean
      }
      /** Painel (só equipe): agendamentos do período, inclusive cancelados. Máximo de 31 dias. */
      listar_agenda: {
        Args: {
          /** Dia no formato "AAAA-MM-DD" (calendário de São Paulo). */
          p_de: string
          p_ate: string
        }
        Returns: {
          id: string
          codigo: string
          status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'nao_compareceu'
          inicio: string
          fim: string
          barbeiro_id: string
          barbeiro_nome: string
          servico_nome: string
          servico_tipo: string
          cliente_nome: string
          cliente_telefone: string
          /** Quando o pendente venceu e foi cancelado sozinho; nulo = cancelamento manual ou nunca cancelado. */
          expirado_em: string | null
        }[]
      }
      /** Painel (só equipe): bloqueios do período. barbeiro_id nulo = barbearia inteira. */
      listar_bloqueios: {
        Args: { p_de: string; p_ate: string }
        Returns: {
          id: string
          barbeiro_id: string | null
          barbeiro_nome: string | null
          inicio: string
          fim: string
          motivo: string
        }[]
      }
      /**
       * Painel (só equipe): cria um bloqueio. barbeiro nulo = barbearia inteira. NÃO recusa se já houver
       * agendamento no período: devolve quantos há (`conflitos`) e deixa todos como estão.
       */
      criar_bloqueio: {
        Args: { p_barbeiro_id: string | null; p_inicio: string; p_fim: string; p_motivo: string }
        Returns: { id: string; conflitos: number }[]
      }
      /** Painel (só equipe): apaga o bloqueio. Erro URB15 se ele não existe mais. */
      remover_bloqueio: {
        Args: { p_id: string }
        Returns: undefined
      }
      /** Painel (só equipe): muda o status e devolve a linha atualizada (mesmas colunas de listar_agenda). */
      mudar_status: {
        Args: {
          p_id: string
          p_status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'nao_compareceu'
        }
        Returns: {
          id: string
          codigo: string
          status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'nao_compareceu'
          inicio: string
          fim: string
          barbeiro_id: string
          barbeiro_nome: string
          servico_nome: string
          servico_tipo: string
          cliente_nome: string
          cliente_telefone: string
          /** Preenchido se o pendente já tinha vencido: o servidor o expirou e NÃO aplicou o status pedido. */
          expirado_em: string | null
        }[]
      }
      horarios_disponiveis: {
        Args: {
          /** Um combo, OU 1 a 5 avulsos distintos (slugs). */
          p_servicos: string[]
          /** Dia no formato "AAAA-MM-DD" (calendário de São Paulo). */
          p_dia: string
          /** null ou ausente = sem preferência de barbeiro. */
          p_barbeiro?: string | null
        }
        /** Cada item é um início livre, em timestamptz (texto ISO). */
        Returns: { inicio: string }[]
      }
      criar_agendamento: {
        Args: {
          /** Um combo, OU 1 a 5 avulsos distintos (slugs). */
          p_servicos: string[]
          /** null = sem preferência: o servidor escolhe um barbeiro livre. */
          p_barbeiro: string | null
          /** Texto ISO com fuso (timestamptz). */
          p_inicio: string
          p_nome: string
          p_telefone: string
          /** Honeypot: campo invisível do formulário. Preenchido = robô; o servidor recusa com URB20. */
          p_website?: string | null
        }
        Returns: {
          codigo: string
          barbeiro_nome: string
          /** Nomes juntos, ex.: "Corte + Sobrancelha". */
          servico_nome: string
          inicio: string
          preco_total_centavos: number
          duracao_total_min: number
        }[]
      }
    }
  }
}
