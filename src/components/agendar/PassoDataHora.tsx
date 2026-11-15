import { useEffect, useRef } from 'react'
import OpcaoRadio from './OpcaoRadio.tsx'
import PassoLayout from './PassoLayout.tsx'
import Seta from '../grafico/Seta.tsx'
import { useHorarios } from '../../hooks/useHorarios.ts'
import { formatarDDMM, formatarDiaSemana, formatarHHMM } from '../../lib/agendar/datas.ts'
import type { DiaISO, DiaSelecionavel } from '../../lib/agendar/datas.ts'
import { mensagemDeErro } from '../../lib/agendar/erros.ts'
import { proximoDiaAberto } from '../../lib/agendar/estado.ts'
import { contato, janelaMaximaDias, mensagemWhatsAppPadrao } from '../../data/barbearia.ts'
import { linkWhatsApp } from '../../lib/whatsapp.ts'

interface Props {
  dias: DiaSelecionavel[]
  servicos: string[]
  barbeiro: string | null
  dia: DiaISO | null
  hora: string | null
  /** O horário veio de outro serviço/barbeiro: confere contra a lista assim que ela carrega. */
  horaPorConferir: boolean
  aoHoraConferida: () => void
  aoHoraIndisponivel: () => void
  aoEscolherDia: (dia: DiaISO) => void
  aoEscolherHora: (hora: string) => void
  aoTrocarBarbeiro: () => void
  aoTrocarServico: () => void
  /** Aviso vindo da confirmação (ex.: "Alguém acabou de pegar esse horário"). */
  aviso?: string | null
}

const botaoTexto =
  'inline-flex min-h-11 items-center gap-3 font-display text-2xl tracking-wider text-branco uppercase underline decoration-neon decoration-2 underline-offset-4 transition-colors duration-rapida hover:text-neon'

// Passo 3. Em cima, a faixa de dias; embaixo, os horários livres do dia escolhido.
// Os dois ficam na mesma tela para o cliente comparar dias sem ir e voltar.
export default function PassoDataHora({
  dias,
  servicos,
  barbeiro,
  dia,
  hora,
  horaPorConferir,
  aoHoraConferida,
  aoHoraIndisponivel,
  aoEscolherDia,
  aoEscolherHora,
  aoTrocarBarbeiro,
  aoTrocarServico,
  aviso = null,
}: Props) {
  const faixa = useRef<HTMLDivElement>(null)
  const horarios = useHorarios(servicos, dia, barbeiro)

  // Se o dia escolhido está fora da parte visível da faixa (ex.: atalho "próximo dia aberto"),
  // rola a faixa até ele. block "nearest" evita mexer na rolagem vertical da página.
  useEffect(() => {
    faixa.current
      ?.querySelector('input:checked')
      ?.closest('label')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [dia])

  // Trocou serviço ou barbeiro e já havia horário? Com a lista nova na mão, o horário fica se
  // ainda está livre; se não, avisa e a pessoa escolhe outro no mesmo dia.
  const listaHorarios = horarios.status === 'ok' ? horarios.horarios : null
  useEffect(() => {
    if (!horaPorConferir || hora === null || listaHorarios === null) return
    if (listaHorarios.includes(hora)) aoHoraConferida()
    else aoHoraIndisponivel()
  }, [horaPorConferir, hora, listaHorarios, aoHoraConferida, aoHoraIndisponivel])

  const proximo = dia === null ? null : proximoDiaAberto(dias, dia)
  const tituloHorarios =
    dia === null ? 'Horários' : `${formatarDiaSemana(dia)} ${formatarDDMM(dia)}`

  return (
    <PassoLayout
      numero={3}
      titulo="Dia e hora"
      ajuda="Escolha o dia. Só aparece horário que está livre de verdade."
    >
      {/* Região live SEMPRE montada: o leitor de tela anuncia quando o texto é trocado dentro dela. */}
      <div data-testid="aviso-horario" aria-live="assertive" aria-atomic="true">
        {aviso !== null && (
          <p className="mb-8 border-2 border-neon bg-asfalto p-4 font-corpo text-lg text-branco">
            {aviso}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="font-corpo text-sm tracking-widest text-neon uppercase">Dia</legend>
        {/* Celular: faixa que rola de lado (só ela, a página não). Desktop: os dias quebram em linhas. */}
        <div
          ref={faixa}
          className="-mx-gutter mt-4 overflow-x-auto px-gutter pb-2 md:mx-0 md:overflow-visible md:px-0"
        >
          <div className="flex w-max snap-x gap-2 md:grid md:w-auto md:grid-cols-7">
            {dias.map((d, i) => {
              const escolhido = dia === d.iso
              return (
                <OpcaoRadio
                  key={d.iso}
                  nome="dia"
                  valor={d.iso}
                  selecionado={escolhido}
                  desabilitado={d.fechado}
                  aoEscolher={aoEscolherDia}
                  className="w-20 shrink-0 snap-start md:w-auto"
                >
                  <span
                    className={`flex min-h-24 md:min-h-20 flex-col items-center justify-center gap-1 border-2 py-2 text-center transition-colors duration-rapida ${
                      d.fechado
                        ? 'border-cimento bg-asfalto text-chumbo'
                        : escolhido
                          ? 'border-neon bg-neon text-preto'
                          : 'border-cimento bg-asfalto text-branco hover:border-chumbo'
                    }`}
                  >
                    <span className="font-corpo text-sm tracking-widest uppercase">
                      {formatarDiaSemana(d.iso).slice(0, 3)}
                    </span>
                    <span className="font-display text-3xl leading-none md:text-2xl">
                      {formatarDDMM(d.iso)}
                    </span>
                    <span className="font-corpo text-xs tracking-widest uppercase md:tracking-normal">
                      {d.fechado ? 'Fechado' : i === 0 ? 'Hoje' : ' '}
                    </span>
                  </span>
                </OpcaoRadio>
              )
            })}
          </div>
        </div>
      </fieldset>

      <section aria-labelledby="titulo-horarios" className="mt-10">
        <h2 id="titulo-horarios" className="text-display-sm">
          Horários · {tituloHorarios}
        </h2>

        {/* O erro fica FORA da região aria-live: ele já tem role="alert"; os dois juntos anunciariam em dobro. */}
        {horarios.status === 'erro' && (
          <div className="mt-4">
            <ErroHorarios
              erro={horarios.erro}
              aoTentarDeNovo={horarios.tentarDeNovo}
              aoTrocarServico={aoTrocarServico}
            />
          </div>
        )}

        {/* aria-live: o leitor de tela anuncia quando termina de carregar ou aparece o vazio.
            min-h-54 (13,5 rem) = a altura do esqueleto no celular: a página não pula quando os horários chegam. */}
        <div aria-live="polite" aria-busy={horarios.status === 'carregando'} className={`mt-4 ${horarios.status === 'erro' ? '' : 'min-h-54'}`}>
          {horarios.status === 'carregando' && (
            <>
              <p className="sr-only">Buscando horários livres.</p>
              <div
                aria-hidden="true"
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5"
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className="listras h-12 border border-cimento text-cimento opacity-70 motion-safe:animate-pulse"
                  />
                ))}
              </div>
            </>
          )}

          {dia === null && (
            <div className="border border-cimento bg-asfalto p-6">
              <p className="font-corpo text-lg text-branco">
                Sem dias abertos nos próximos {janelaMaximaDias} dias.
              </p>
              <a
                href={linkWhatsApp(contato.whatsapp, mensagemWhatsAppPadrao)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-4 ${botaoTexto}`}
              >
                Chamar no WhatsApp
              </a>
            </div>
          )}

          {dia !== null && horarios.status === 'ok' && horarios.horarios.length === 0 && (
            <div className="border border-cimento bg-asfalto p-6">
              <p className="font-corpo text-lg text-branco">
                Sem horário livre nesse dia. Tenta outro dia ou outro barbeiro.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1">
                {proximo !== null && (
                  <button
                    type="button"
                    className={botaoTexto}
                    onClick={() => aoEscolherDia(proximo)}
                  >
                    Próximo dia aberto: {formatarDiaSemana(proximo)} {formatarDDMM(proximo)}
                    <Seta className="h-3 w-10 shrink-0 text-neon" />
                  </button>
                )}
                {barbeiro !== null && (
                  <button type="button" className={botaoTexto} onClick={aoTrocarBarbeiro}>
                    Trocar barbeiro
                  </button>
                )}
                {/* Último dia da janela e sem barbeiro para trocar: a saída é falar com a barbearia. */}
                {proximo === null && barbeiro === null && (
                  <a
                    href={linkWhatsApp(contato.whatsapp, mensagemWhatsAppPadrao)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={botaoTexto}
                  >
                    Chamar no WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {horarios.status === 'ok' && horarios.horarios.length > 0 && (
            <fieldset>
              <legend className="sr-only">
                {horarios.horarios.length} horários livres em {tituloHorarios}
              </legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {horarios.horarios.map((h) => {
                  const escolhido = hora === h
                  return (
                    <OpcaoRadio
                      key={h}
                      nome="horario"
                      valor={h}
                      selecionado={escolhido}
                      aoEscolher={aoEscolherHora}
                    >
                      <span
                        className={`flex min-h-12 items-center justify-center border-2 font-display text-2xl tracking-wider transition-colors duration-rapida ${
                          escolhido
                            ? 'border-neon bg-neon text-preto'
                            : 'border-cimento bg-asfalto text-branco hover:border-chumbo'
                        }`}
                      >
                        {formatarHHMM(h)}
                      </span>
                    </OpcaoRadio>
                  )
                })}
              </div>
            </fieldset>
          )}
        </div>
      </section>
    </PassoLayout>
  )
}

interface PropsErro {
  erro: Parameters<typeof mensagemDeErro>[0]
  aoTentarDeNovo: () => void
  aoTrocarServico: () => void
}

// Erro ao buscar horários: mensagem da Menezes e a ação certa para cada tipo de erro.
function ErroHorarios({ erro, aoTentarDeNovo, aoTrocarServico }: PropsErro) {
  const { mensagem, acao } = mensagemDeErro(erro)
  const recomecar = acao === 'recomecar'
  return (
    <div role="alert" className="border-2 border-cimento bg-asfalto p-6">
      <p className="font-corpo text-lg text-branco">{mensagem}</p>
      <button
        type="button"
        className={`mt-4 ${botaoTexto}`}
        onClick={recomecar ? aoTrocarServico : aoTentarDeNovo}
      >
        {recomecar ? 'Escolher de novo' : 'Tentar de novo'}
      </button>
    </div>
  )
}
