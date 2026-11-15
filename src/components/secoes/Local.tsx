import Seta from '../grafico/Seta.tsx'
import MapaEstilizado from '../MapaEstilizado.tsx'
import { contato, horarioFuncionamento, mensagemWhatsAppPadrao, type FaixaHorario } from '../../data/barbearia.ts'
import { linkWhatsApp } from '../../lib/whatsapp.ts'

// Endereço e horário vêm de data/barbearia.ts (dados da página da barbearia no AppBarber).
const enderecoCompleto = `${contato.endereco.linha1}, ${contato.endereco.linha2}`
const linkMapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`

/** Períodos em que a barbearia atende no dia: com almoço são dois (manhã e tarde); sem almoço, um. */
function periodos(faixa: FaixaHorario): string[] {
  if (!faixa.abre || !faixa.fecha) return []
  if (!faixa.almoco) return [`${faixa.abre} às ${faixa.fecha}`]
  return [`${faixa.abre} às ${faixa.almoco.inicio}`, `${faixa.almoco.fim} às ${faixa.fecha}`]
}

export default function Local() {
  return (
    <section id="local" className="relative scroll-mt-16 overflow-x-clip bg-preto py-16 md:py-secao">
      <div className="grid gap-12 px-gutter md:grid-cols-12 md:gap-10">
        <div className="md:col-span-5">
          <h2 className="text-display-md">Onde estamos</h2>

          <address className="mt-8 font-corpo text-xl text-branco not-italic">
            {contato.endereco.linha1}
            <br />
            {contato.endereco.linha2}
            <a
              href={`tel:${contato.telefoneFixo.tel}`}
              className="mt-3 block w-fit border-b border-cimento text-lg text-cinza-claro transition-colors duration-rapida hover:border-neon hover:text-neon"
            >
              {contato.telefoneFixo.rotulo}
            </a>
          </address>

          <h3 className="mt-10 text-display-sm">Horários</h3>
          <ul className="mt-4 border-t border-cimento">
            {horarioFuncionamento.map((faixa) => {
              const lista = periodos(faixa)
              return (
                <li key={faixa.rotulo} className="flex items-start justify-between gap-6 border-b border-cimento py-3">
                  <span className="font-corpo text-lg font-semibold text-branco">{faixa.rotulo}</span>
                  <span className={`text-right font-corpo text-lg tabular-nums ${lista.length > 0 ? 'text-cinza-claro' : 'text-chumbo'}`}>
                    {lista.length > 0
                      ? lista.map((periodo) => (
                          <span key={periodo} className="block">
                            {periodo}
                          </span>
                        ))
                      : 'Fechado'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-6 md:col-span-7 md:pt-16">
          <MapaEstilizado className="aspect-[4/3] w-full md:aspect-[5/4]" />
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={linkMapa}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-h-11 items-center gap-3 font-corpo font-semibold text-branco transition-colors duration-rapida hover:text-neon"
            >
              Abrir no Google Maps
              <Seta className="h-3 w-10 text-neon transition-transform duration-rapida group-hover:translate-x-1" />
            </a>
            <a
              href={linkWhatsApp(contato.whatsapp, mensagemWhatsAppPadrao)}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao--secundario"
            >
              Chamar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
