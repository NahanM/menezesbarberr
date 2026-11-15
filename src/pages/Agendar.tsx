import { useCallback, useReducer, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import BarraAcao from '../components/agendar/BarraAcao.tsx'
import CabecalhoAgendar from '../components/agendar/CabecalhoAgendar.tsx'
import PassoBarbeiro from '../components/agendar/PassoBarbeiro.tsx'
import PassoDados, { ID_FORM_DADOS } from '../components/agendar/PassoDados.tsx'
import PassoDataHora from '../components/agendar/PassoDataHora.tsx'
import PassoRevisao from '../components/agendar/PassoRevisao.tsx'
import PassoServico from '../components/agendar/PassoServico.tsx'
import { FocarTituloContext } from '../components/agendar/focoContext.ts'
import Seta from '../components/grafico/Seta.tsx'
import { useConfirmarAgendamento } from '../hooks/useConfirmarAgendamento.ts'
import { useNavegacaoAgendar } from '../hooks/useNavegacaoAgendar.ts'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.ts'
import { useRascunhoInicial, useSalvarRascunho } from '../hooks/useRascunho.ts'
import { buscarBarbeiro, resumirServicos } from '../lib/agendar/catalogo.ts'
import { dadosValidos, limparNome, type DadosCliente } from '../lib/agendar/dados.ts'
import {
  diasSelecionaveis,
  formatarDDMM,
  formatarDiaSemana,
  formatarHHMM,
} from '../lib/agendar/datas.ts'
import {
  AVISO_HORA_NAO_CABE,
  estadoInicial,
  passoResolvido,
  reduzir,
} from '../lib/agendar/estado.ts'
import { lerPreSelecao } from '../lib/agendar/preselecao.ts'
import { formatarDuracao, formatarPreco } from '../lib/formatar.ts'

// Fluxo de agendamento (composição). Quem manda no passo atual é a URL (?passo=2); a navegação
// fica em useNavegacaoAgendar, o envio em useConfirmarAgendamento e o rascunho em useRascunho.
// As ESCOLHAS (serviço, barbeiro, dia, hora) ficam num reducer em memória e, junto com o que foi
// digitado, são copiadas para o sessionStorage: sobrevivem a ir e voltar e a recarregar a página.
// "Editar" na revisão abre o passo com ?editar=1: o botão principal vira "Voltar à revisão" e
// pula os passos do meio.
export default function Agendar() {
  const { params, irPara, voltar, irParaRevisao } = useNavegacaoAgendar()
  const reduzirMovimento = usePrefersReducedMotion()

  // A lista de dias é calculada uma vez ao abrir a página.
  const [dias] = useState(() => diasSelecionaveis())
  const rascunho = useRascunhoInicial(dias, params.get('passo') !== null)
  const [estado, despachar] = useReducer(
    reduzir,
    undefined,
    () => rascunho?.estado ?? estadoInicial(lerPreSelecao(params), dias),
  )
  const [dados, setDados] = useState<DadosCliente>(
    () => rascunho?.dados ?? { nome: '', telefone: '' },
  )
  useSalvarRascunho(estado, dados, rascunho)
  // Honeypot: fora de `dados` de propósito, porque `dados` vai inteiro para o sessionStorage.
  const [website, setWebsite] = useState('')

  // Veio da landing com serviço escolhido (?combo= ou ?servico=)? Então o primeiro passo mostrado é o do barbeiro.
  // Serviço que veio do rascunho não conta: quem voltou até a primeira entrada do histórico vê o passo 1.
  const [passoPadrao] = useState(() => (rascunho !== null || estado.servicos.length === 0 ? 1 : 2))
  const dadosOk = dadosValidos(dados)
  const passo = passoResolvido(params.get('passo'), estado, passoPadrao, dadosOk)

  // Editando um item vindo da revisão (?editar=1)? E já dá para voltar a ela (tem tudo)?
  // Então o botão principal vira "Voltar à revisão".
  const voltaRevisao =
    params.get('editar') === '1' &&
    passo < 5 &&
    estado.servicos.length > 0 &&
    estado.hora !== null &&
    estado.dia !== null &&
    dadosOk

  // Aviso do passo 3 (horário perdido ou que não cabe mais).
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null)
  const { confirmar, enviando, demorando, erroConfirmar, erroServidor, limparErroServidor } =
    useConfirmarAgendamento({
      estado,
      dados,
      website,
      limparWebsite: () => setWebsite(''),
      despachar,
      irPara,
      definirAviso: setAvisoHorario,
    })

  // O foco só vai para o título depois de a pessoa trocar de passo, não na primeira carga.
  // (Padrão "guardar o valor anterior no state": atualizar durante o render é permitido.)
  const [passoVisto, setPassoVisto] = useState(passo)
  const [trocouDePasso, setTrocouDePasso] = useState(false)
  if (passo !== passoVisto) {
    setPassoVisto(passo)
    setTrocouDePasso(true)
  }

  // Trocar serviço, barbeiro ou dia deixa o aviso do horário para trás.
  const alternarServico = (slug: string) => {
    setAvisoHorario(null)
    despachar({ tipo: 'alternar-servico', slug })
  }
  const escolherBarbeiro = (slug: string | null) => {
    setAvisoHorario(null)
    despachar({ tipo: 'escolher-barbeiro', slug })
  }
  const escolherDia = (dia: string) => {
    setAvisoHorario(null)
    despachar({ tipo: 'escolher-dia', dia })
  }

  // O passo 3 conferiu o horário guardado contra a lista que acabou de carregar.
  // Continua livre e a pessoa está editando: volta SOZINHA à revisão (replace, sem parada).
  // Não cabe mais: some a hora, avisa e fica no passo 3 com o mesmo dia.
  const horaConferida = useCallback(() => {
    despachar({ tipo: 'hora-conferida' })
    if (voltaRevisao) irPara(5, 3, true, false)
  }, [voltaRevisao, irPara])
  const horaIndisponivel = useCallback(() => {
    despachar({ tipo: 'limpar-hora' })
    setAvisoHorario(AVISO_HORA_NAO_CABE)
  }, [])

  const servico = resumirServicos(estado.servicos)
  const barbeiro = buscarBarbeiro(estado.barbeiro)
  const nomeBarbeiro = barbeiro?.nome ?? 'Sem preferência'
  const quando =
    estado.hora === null
      ? null
      : `${formatarDiaSemana(estado.hora)} ${formatarDDMM(estado.hora)} às ${formatarHHMM(estado.hora)}`

  // O que a barra de baixo mostra em cada passo.
  const barra = {
    resumo: servico?.nome ?? 'Escolha um serviço',
    detalhe:
      servico === undefined
        ? undefined
        : [
            servico.quantidade > 1 ? `${servico.quantidade} serviços` : null,
            formatarDuracao(servico.duracaoMinutos),
            passo >= 2 ? nomeBarbeiro : null,
            quando,
          ]
            .filter((x) => x !== null)
            .join(' · '),
    preco: servico === undefined ? undefined : formatarPreco(servico.precoCentavos),
    desabilitado:
      passo === 1
        ? servico === undefined
        : passo === 3
          ? estado.hora === null || estado.horaPorConferir
          : passo === 5
            ? // URB06: tentar de novo não adianta, a saída é o WhatsApp da barbearia.
              enviando || erroConfirmar?.acao === 'chamar-whatsapp'
            : false,
    rotulo:
      passo === 5
        ? enviando
          ? 'Enviando'
          : 'Confirmar'
        : voltaRevisao
          ? 'Voltar à revisão'
          : passo === 4
            ? 'Revisar'
            : 'Continuar',
  }

  // Animação entre passos: só opacity e transform. Com reduced-motion não há movimento nenhum.
  const entrada = reduzirMovimento ? { opacity: 1 } : { opacity: 0, x: 32 }
  const saida = reduzirMovimento ? { opacity: 1 } : { opacity: 0, x: -32 }

  return (
    <>
      <CabecalhoAgendar passo={passo} />
      <main id="conteudo" className="mx-auto min-h-dvh overflow-x-clip max-w-6xl px-gutter pt-24 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-32">
        {passo > 1 && (
          <button
            type="button"
            // Editando a partir da revisão, "Voltar" cancela a edição e volta a ela.
            onClick={() =>
              voltaRevisao ? irParaRevisao(passo, estado.horaPorConferir) : voltar(passo)
            }
            disabled={enviando}
            className="mb-6 inline-flex min-h-11 items-center gap-3 font-corpo text-sm tracking-widest text-cinza-claro uppercase transition-colors duration-rapida enabled:hover:text-branco disabled:opacity-40"
          >
            <Seta direcao="esquerda" className="h-3 w-10 text-neon" />
            Voltar
          </button>
        )}

        <FocarTituloContext value={trocouDePasso}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={passo}
              initial={entrada}
              animate={{ opacity: 1, x: 0 }}
              exit={saida}
              transition={{
                duration: reduzirMovimento ? 0 : 0.25,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {passo === 1 && <PassoServico servicos={estado.servicos} aoAlternar={alternarServico} />}
              {passo === 2 && (
                <PassoBarbeiro barbeiro={estado.barbeiro} aoEscolher={escolherBarbeiro} />
              )}
              {passo === 3 && estado.servicos.length > 0 && (
                <PassoDataHora
                  dias={dias}
                  servicos={estado.servicos}
                  barbeiro={estado.barbeiro}
                  dia={estado.dia}
                  hora={estado.hora}
                  horaPorConferir={estado.horaPorConferir}
                  aoHoraConferida={horaConferida}
                  aoHoraIndisponivel={horaIndisponivel}
                  aoEscolherDia={escolherDia}
                  aoEscolherHora={(hora) => {
                    setAvisoHorario(null)
                    despachar({ tipo: 'escolher-hora', hora })
                  }}
                  aviso={avisoHorario}
                  aoTrocarBarbeiro={() => irPara(2, 3)}
                  aoTrocarServico={() => irPara(1, 3)}
                />
              )}
              {passo === 4 && (
                <PassoDados
                  dados={dados}
                  website={website}
                  aoMudarWebsite={setWebsite}
                  aoMudar={(novos) => {
                    limparErroServidor()
                    setDados(novos)
                  }}
                  aoValidar={() => irParaRevisao(passo, estado.horaPorConferir)}
                  erroServidor={erroServidor}
                />
              )}
              {passo === 5 && servico !== undefined && (
                <PassoRevisao
                  linhas={[
                    { rotulo: servico.quantidade > 1 ? 'Serviços' : 'Serviço', valor: servico.nome, passoEditar: 1 },
                    {
                      rotulo: 'Barbeiro',
                      valor: nomeBarbeiro,
                      nota:
                        barbeiro === undefined ? 'A gente escolhe quem estiver livre.' : undefined,
                      passoEditar: 2,
                    },
                    { rotulo: 'Quando', valor: quando ?? '', passoEditar: 3 },
                    {
                      rotulo: 'Nome',
                      valor: limparNome(dados.nome),
                      passoEditar: 4,
                    },
                    {
                      rotulo: 'WhatsApp',
                      valor: dados.telefone,
                      passoEditar: 4,
                    },
                  ]}
                  preco={formatarPreco(servico.precoCentavos)}
                  aoEditar={(n) => irPara(n, 5, false, true)}
                  enviando={enviando}
                  demorando={demorando}
                  erro={erroConfirmar}
                  aoRecomecar={() => irPara(1, 5, true, false)}
                  aoTentarDeNovo={() => void confirmar()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </FocarTituloContext>
      </main>

      {passo <= 5 && (
        <BarraAcao
          resumo={barra.resumo}
          detalhe={barra.detalhe}
          preco={barra.preco}
          rotulo={barra.rotulo}
          desabilitado={barra.desabilitado}
          aoContinuar={
            passo === 5
              ? () => void confirmar()
              : passo === 4
                ? undefined
                : voltaRevisao
                  ? () => irParaRevisao(passo, estado.horaPorConferir)
                  : () => irPara(passo + 1, passo)
          }
          formId={passo === 4 ? ID_FORM_DADOS : undefined}
        />
      )}
    </>
  )
}
