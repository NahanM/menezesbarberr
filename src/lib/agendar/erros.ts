// Traduz os erros do servidor (códigos URB01..URB09, URB16, URB18 e URB20) e de rede em mensagens
// curtas para o cliente, mais a "ação" que a tela deve oferecer.

/** Códigos que o banco devolve, mais dois nossos: falha de rede e erro desconhecido. */
export type CodigoErro =
  | 'URB01' // serviço inexistente ou inativo
  | 'URB02' // barbeiro inexistente ou inativo
  | 'URB03' // nome inválido
  | 'URB04' // telefone inválido
  | 'URB05' // horário indisponível
  | 'URB06' // limite de pendentes por telefone
  | 'URB07' // horário acabou de ser ocupado
  | 'URB08' // parâmetro ausente
  | 'URB09' // não deu para gerar o código; tentar de novo
  | 'URB16' // combinação de serviços inválida (combo misturado, repetido ou demais)
  | 'URB18' // limite global de criações (muitos pedidos de todos os visitantes juntos)
  | 'URB20' // honeypot preenchido (robô de formulário); mensagem neutra
  | 'REDE'
  | 'DESCONHECIDO'

export interface ErroAgendar {
  codigo: CodigoErro
}

/** O que a tela deve oferecer ao cliente depois do erro. */
export type AcaoErro =
  | 'voltar-horarios' // volta ao passo dos horários
  | 'recomecar' // volta ao passo do serviço/barbeiro
  | 'corrigir-dados' // volta ao formulário de nome e WhatsApp
  | 'tentar-de-novo' // repete a mesma chamada
  | 'chamar-whatsapp' // sem saída pela tela: falar com a barbearia
  | 'tentar-ou-whatsapp' // passa sozinho em alguns minutos: tentar de novo OU falar com a barbearia

export interface MensagemErro {
  mensagem: string
  acao: AcaoErro
}

const CODIGOS_DO_BANCO = [
  'URB01',
  'URB02',
  'URB03',
  'URB04',
  'URB05',
  'URB06',
  'URB07',
  'URB08',
  'URB09',
  'URB16',
  'URB18',
  'URB20',
] as const

type CodigoDoBanco = (typeof CODIGOS_DO_BANCO)[number]

function ehCodigoDoBanco(valor: unknown): valor is CodigoDoBanco {
  return typeof valor === 'string' && (CODIGOS_DO_BANCO as readonly string[]).includes(valor)
}

/**
 * Recebe qualquer coisa que tenha dado errado (erro do Supabase, exceção, texto)
 * e devolve um ErroAgendar. O Supabase põe o código do banco em `code`.
 */
export function normalizarErro(erro: unknown): ErroAgendar {
  // Não sabemos o formato do erro, então olhamos só as duas propriedades que importam.
  const objeto: { code?: unknown; message?: unknown } =
    typeof erro === 'object' && erro !== null ? erro : {}

  if (ehCodigoDoBanco(objeto.code)) return { codigo: objeto.code }

  const texto = typeof objeto.message === 'string' ? objeto.message : ''
  // Plano B: se o código não veio em `code`, procura "URB0x" dentro da mensagem.
  const achado = /URB(?:0[1-9]|1[68]|20)/.exec(texto)?.[0]
  if (ehCodigoDoBanco(achado)) return { codigo: achado }

  // Sem internet o navegador diz "Failed to fetch" (Chrome), "Load failed" (Safari)
  // ou "NetworkError..." (Firefox). Conexão que travou e estourou o limite de espera (api.ts) conta como rede.
  if (/failed to fetch|load failed|network|timeout|timed out|abort/i.test(texto)) {
    return { codigo: 'REDE' }
  }
  return { codigo: 'DESCONHECIDO' }
}

const MENSAGENS: Record<CodigoErro, MensagemErro> = {
  URB01: { mensagem: 'Esse serviço saiu da lista. Escolha de novo.', acao: 'recomecar' },
  URB02: { mensagem: 'Esse barbeiro não está disponível. Escolha de novo.', acao: 'recomecar' },
  URB03: {
    mensagem: 'Nome inválido. Use de 2 a 60 caracteres, com letras.',
    acao: 'corrigir-dados',
  },
  URB04: { mensagem: 'WhatsApp inválido. Use DDD + número.', acao: 'corrigir-dados' },
  URB05: {
    mensagem: 'Esse horário não está mais disponível. Escolha outro.',
    acao: 'voltar-horarios',
  },
  URB06: {
    mensagem: 'Você já tem horários aguardando confirmação. Fale com a gente pelo WhatsApp.',
    acao: 'chamar-whatsapp',
  },
  URB07: {
    mensagem: 'Alguém acabou de pegar esse horário. Escolha outro.',
    acao: 'voltar-horarios',
  },
  URB08: {
    mensagem: 'Faltou preencher alguma coisa. Confira e tente de novo.',
    acao: 'tentar-de-novo', // não diz qual campo: não há o que marcar no formulário
  },
  URB16: {
    mensagem: 'Essa combinação de serviços não vale. Combo vai sozinho, avulsos até 5. Escolha de novo.',
    acao: 'recomecar',
  },
  URB18: {
    mensagem: 'Muitos pedidos agora. Tente em alguns minutos ou chame no WhatsApp.',
    acao: 'tentar-ou-whatsapp', // seus dados continuam na tela; nada a corrigir
  },
  URB20: {
    // Neutra de propósito: não diz que existe um campo-armadilha. Quem foi pego por um preenchimento
    // automático tenta de novo (o hook limpa o campo antes) ou chama no WhatsApp.
    mensagem: 'Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.',
    acao: 'tentar-ou-whatsapp',
  },
  URB09: { mensagem: 'Não deu para gerar seu código. Tente de novo.', acao: 'tentar-de-novo' },
  REDE: { mensagem: 'Sem conexão. Confira a internet e tente de novo.', acao: 'tentar-de-novo' },
  DESCONHECIDO: {
    mensagem: 'Algo deu errado do nosso lado. Tente de novo.',
    acao: 'tentar-de-novo',
  },
}

/** Mensagem curta (voz da Menezes) + ação sugerida para a tela. */
export function mensagemDeErro(erro: ErroAgendar): MensagemErro {
  return MENSAGENS[erro.codigo]
}
