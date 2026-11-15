import { Link, useLocation } from 'react-router'
import CabecalhoAgendar from '../components/agendar/CabecalhoAgendar.tsx'
import FotoDiagonal from '../components/grafico/FotoDiagonal.tsx'
import PalavraVazada from '../components/grafico/PalavraVazada.tsx'
import Sucesso from '../components/agendar/Sucesso.tsx'
import { contato, mensagemWhatsAppPadrao } from '../data/barbearia.ts'
import { lerReserva, reservaValida, VALIDADE_RESERVA_MS } from '../lib/agendar/reserva.ts'
import { linkWhatsApp } from '../lib/whatsapp.ts'
import { formatarDuracao, formatarPreco } from '../lib/formatar.ts'

// Rota /agendar/sucesso. Os dados vêm do state da navegação (caminho normal) ou do
// sessionStorage (recarregou a página, ou o WhatsApp fechou a aba). Sem nenhum dos dois,
// não há reserva para mostrar.
export default function AgendarSucesso() {
  const location = useLocation()
  const doState: unknown = location.state
  // Mesma regra de validade (formato e 2 horas) nos dois caminhos.
  const reserva = lerReserva() ?? reservaValida(doState)

  if (reserva === null) {
    return (
      <>
        <CabecalhoAgendar passo={5} />
        <main id="conteudo" className="mx-auto min-h-dvh max-w-6xl overflow-x-clip px-gutter pt-24 pb-16 md:pt-32">
          <section className="grid gap-10 md:grid-cols-12 md:gap-12">
            <div className="md:col-span-7">
              <PalavraVazada texto="MB" className="text-[44vw] text-chumbo md:text-display-xl" />
              <h1 className="mt-4 text-display-lg md:text-display-md">Nenhuma reserva recente.</h1>
              <p className="mt-6 max-w-md font-corpo text-lg text-cinza-claro">
                Não achamos um horário reservado neste aparelho. A reserva fica guardada aqui por{' '}
                {VALIDADE_RESERVA_MS / 3_600_000} horas: depois disso, ou em outro aparelho, ela não
                aparece. Já reservou? Chame a barbearia no WhatsApp para conferir.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
                <Link
                  to="/agendar"
                  className="inline-flex min-h-12 items-center bg-neon px-6 font-display text-2xl tracking-wider text-preto uppercase transition-colors duration-rapida ease-urbz hover:bg-branco"
                >
                  Agendar um horário
                </Link>
                <a
                  href={linkWhatsApp(contato.whatsapp, mensagemWhatsAppPadrao)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center border-b border-neon font-display text-2xl tracking-wider text-branco uppercase transition-colors duration-rapida hover:text-neon"
                >
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            <FotoDiagonal
              nome="salao"
              sizes="(min-width: 768px) 42vw, 100vw"
              alt="Interior da barbearia, com espelhos em arco e luz dourada"
              foco={{ celular: '55% 50%', desktop: '55% 50%' }}
              imediata
              className="aspect-[16/10] md:col-span-5 md:aspect-[4/5]"
            />
          </section>
        </main>
      </>
    )
  }

  return (
    <>
      <CabecalhoAgendar passo={5} />
      <Sucesso
        codigo={reserva.codigo}
        servico={reserva.servico_nome}
        barbeiro={reserva.barbeiro_nome}
        inicio={reserva.inicio}
        nome={reserva.nome}
        preco={
          reserva.preco_centavos === undefined ? undefined : formatarPreco(reserva.preco_centavos)
        }
        duracao={
          reserva.duracao_min === undefined ? undefined : formatarDuracao(reserva.duracao_min)
        }
      />
    </>
  )
}
