// Mensagem de confirmação que o cliente manda para o WhatsApp da barbearia.

import { contato } from '../../data/barbearia.ts'
import { linkWhatsApp } from '../whatsapp.ts'
import { formatarDDMM, formatarDiaSemana, formatarHHMM } from './datas.ts'

export interface DadosConfirmacao {
  /** Nome do serviço ou combo (ex.: "Cuidado Completo"). */
  servico: string
  /** Nome do barbeiro que o servidor definiu (ex.: "Rafael"). */
  barbeiro: string
  /** Início do atendimento, como veio do banco (timestamptz em texto ISO). */
  inicio: string
  nome: string
  /** Código curto devolvido por criar_agendamento. */
  codigo: string
}

/** Texto exato combinado com o dono. Qualquer mudança aqui muda o que a barbearia recebe. */
export function mensagemWhatsApp(d: DadosConfirmacao): string {
  const dia = formatarDiaSemana(d.inicio)
  const data = formatarDDMM(d.inicio)
  const hora = formatarHHMM(d.inicio)
  return `Olá, pessoal da Menezes! Quero confirmar meu horário: ${d.servico} com ${d.barbeiro}, ${dia} ${data} às ${hora}. Nome: ${d.nome}. Código: ${d.codigo}.`
}

/** Link wa.me para o WhatsApp da barbearia, com a mensagem já codificada. */
export function linkConfirmacao(d: DadosConfirmacao): string {
  return linkWhatsApp(contato.whatsapp, mensagemWhatsApp(d))
}

// ---------------------------------------------------------------
// Painel: a barbearia chama o CLIENTE (sentido contrário ao de cima)
// ---------------------------------------------------------------

export interface DadosContatoCliente {
  nome: string
  /** Início do atendimento, como veio do banco (timestamptz em texto ISO). */
  inicio: string
}

/** Só o primeiro nome, para a conversa soar natural ("Olá, Ana!"). */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

/** Mensagem curta que a barbearia manda ao cliente, sobre o horário dele. */
export function mensagemParaCliente(d: DadosContatoCliente): string {
  const dia = formatarDiaSemana(d.inicio)
  const data = formatarDDMM(d.inicio)
  const hora = formatarHHMM(d.inicio)
  return `Olá, ${primeiroNome(d.nome)}! Aqui é da Menezes Barber’s, sobre seu horário de ${dia} ${data} às ${hora}.`
}

/**
 * Link wa.me para o WhatsApp do cliente. O telefone vem canônico do banco (55 + DDD + número);
 * se vier sem o 55 (10 ou 11 dígitos), acrescentamos. O texto passa por encodeURIComponent.
 */
export function linkParaCliente(telefone: string, d: DadosContatoCliente): string {
  const digitos = telefone.replace(/\D/g, '')
  const canonico = digitos.length <= 11 ? `55${digitos}` : digitos
  return linkWhatsApp(canonico, mensagemParaCliente(d))
}
