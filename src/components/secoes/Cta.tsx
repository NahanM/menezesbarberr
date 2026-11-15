import { Link } from 'react-router'
import { contato, mensagemWhatsAppPadrao } from '../../data/barbearia.ts'
import { linkWhatsApp } from '../../lib/whatsapp.ts'

// Chamada final: um título grande e os dois caminhos para marcar (site ou WhatsApp).
export default function Cta() {
  return (
    <section id="cta" className="scroll-mt-16 overflow-x-clip border-t border-cimento bg-asfalto">
      <div className="px-gutter py-16 md:py-secao">
        <h2 className="max-w-[12ch] text-display-lg">Reserve o seu horário.</h2>
        <div className="mt-8 flex flex-wrap items-center gap-3 md:mt-12">
          <Link to="/agendar" className="botao botao--principal">
            Agendar horário
          </Link>
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
    </section>
  )
}
