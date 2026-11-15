import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { criarAgendamento } from '../lib/agendar/api.ts'
import { limparNome, type CampoDados, type DadosCliente } from '../lib/agendar/dados.ts'
import { mensagemDeErro, type AcaoErro } from '../lib/agendar/erros.ts'
import type { AcaoAgendar, EstadoAgendar } from '../lib/agendar/estado.ts'
import { limparRascunho } from '../lib/agendar/rascunho.ts'
import { salvarReserva } from '../lib/agendar/reserva.ts'

/**
 * Depois deste tempo em "Enviando" a tela avisa que está demorando e oferece o WhatsApp. O envio NÃO é
 * abortado: o servidor pode já ter gravado a reserva, e abortar deixaria a pessoa sem saber. 15 s é o ponto
 * em que quem espera já começa a duvidar; antes disso o aviso só atrapalharia uma conexão lenta mas viva.
 */
export const ENVIO_DEMORANDO_MS = 15_000

interface Opcoes {
  estado: EstadoAgendar
  dados: DadosCliente
  /** Honeypot (campo invisível). Mora fora de `dados` para nunca ir ao rascunho. */
  website: string
  /** Zera o honeypot. Chamado quando o servidor o recusa (URB20), para o reenvio funcionar. */
  limparWebsite: () => void
  despachar: (acao: AcaoAgendar) => void
  irPara: (n: number, de: number, replace?: boolean, editar?: boolean) => void
  /** Mostra o aviso do passo 3 (ex.: "Alguém acabou de pegar esse horário"). */
  definirAviso: (mensagem: string | null) => void
}

/**
 * Confirmar: grava no servidor. Cada tipo de erro leva a um lugar diferente (ver mensagemDeErro).
 * Devolve o estado do envio e o erro da última tentativa, para a tela mostrar.
 */
export function useConfirmarAgendamento({
  estado,
  dados,
  website,
  limparWebsite,
  despachar,
  irPara,
  definirAviso,
}: Opcoes) {
  const navigate = useNavigate()
  const [enviando, setEnviando] = useState(false)
  const [demorando, setDemorando] = useState(false)
  const envioEmCurso = useRef(false) // trava duplo clique antes mesmo de o React redesenhar
  const [erroConfirmar, setErroConfirmar] = useState<{
    mensagem: string
    acao: AcaoErro
  } | null>(null)
  const [erroServidor, setErroServidor] = useState<{
    campo: CampoDados
    mensagem: string
  } | null>(null)

  // Liga o aviso de demora se o envio passar de ENVIO_DEMORANDO_MS; desliga (e cancela o relógio) quando acaba.
  useEffect(() => {
    if (!enviando) return
    const relogio = setTimeout(() => setDemorando(true), ENVIO_DEMORANDO_MS)
    return () => {
      clearTimeout(relogio)
      setDemorando(false)
    }
  }, [enviando])

  const confirmar = async () => {
    if (envioEmCurso.current || estado.servicos.length === 0 || estado.hora === null) return
    envioEmCurso.current = true
    setEnviando(true)
    // O erro anterior fica na tela até a resposta chegar: o botão "Tentar de novo" não some debaixo do foco.
    const nome = limparNome(dados.nome)
    const resultado = await criarAgendamento({
      servicosSlugs: estado.servicos,
      barbeiroSlug: estado.barbeiro,
      inicio: estado.hora,
      nome,
      telefone: dados.telefone,
      website,
    })
    envioEmCurso.current = false
    setEnviando(false)

    if (resultado.ok) {
      // Rota própria: o voltar do celular sai do fluxo (replace troca a entrada do "Confirmar").
      // O sessionStorage guarda a reserva para recarregar a página ou voltar do WhatsApp.
      const reserva = {
        codigo: resultado.dados.codigo,
        servico_nome: resultado.dados.servicoNome,
        barbeiro_nome: resultado.dados.barbeiroNome,
        inicio: resultado.dados.inicio,
        nome,
        preco_centavos: resultado.dados.precoTotalCentavos,
        duracao_min: resultado.dados.duracaoTotalMin,
      }
      // O state leva o mesmo salvoEm: a regra das 2 horas vale também para ele.
      const guardada = salvarReserva(reserva)
      setErroConfirmar(null)
      limparRascunho() // reservou: nenhum dado pessoal do rascunho fica no aparelho
      void navigate('/agendar/sucesso', { replace: true, state: guardada })
      return
    }

    // Honeypot recusado: pessoa de verdade pode ter sido pega pelo autofill. Zera o campo para o
    // "Tentar de novo" ir limpo; robô que preenche de novo é recusado de novo.
    if (resultado.erro.codigo === 'URB20') limparWebsite()
    const { mensagem, acao } = mensagemDeErro(resultado.erro)
    if (acao === 'voltar-horarios' || acao === 'corrigir-dados') setErroConfirmar(null)
    if (acao === 'voltar-horarios') {
      // Horário perdido: some a escolha e o passo 3 recarrega a lista.
      despachar({ tipo: 'limpar-hora' })
      definirAviso(mensagem)
      irPara(3, 5, true, true)
    } else if (acao === 'corrigir-dados') {
      setErroServidor({
        campo: resultado.erro.codigo === 'URB04' ? 'telefone' : 'nome',
        mensagem,
      })
      irPara(4, 5, true, true)
    } else {
      setErroConfirmar({ mensagem, acao })
    }
  }

  return {
    confirmar,
    enviando,
    demorando,
    erroConfirmar,
    erroServidor,
    limparErroServidor: () => setErroServidor(null),
  }
}
