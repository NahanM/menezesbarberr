import Logo from '../Logo.tsx'
import { contato, mensagemWhatsAppPadrao } from '../../data/barbearia.ts'
import { linkWhatsApp } from '../../lib/whatsapp.ts'

const classeLink =
  'inline-flex min-h-11 items-center border-b border-cimento font-corpo text-lg text-branco transition-colors duration-rapida hover:border-neon hover:text-neon'

export default function Rodape() {
  return (
    <footer className="border-t border-cimento bg-preto">
      <div className="flex flex-col gap-10 px-gutter py-12 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Logo titulo="Menezes Barber’s" className="h-14" />
          <p className="max-w-56 font-corpo text-sm text-chumbo">Uma nova experiência para uma antiga tradição.</p>
        </div>
        <ul className="flex flex-wrap gap-x-10 gap-y-2">
          <li>
            <a
              href={linkWhatsApp(contato.whatsapp, mensagemWhatsAppPadrao)}
              target="_blank"
              rel="noopener noreferrer"
              className={classeLink}
            >
              WhatsApp (46) 99983-3026
            </a>
          </li>
          <li>
            <a href={contato.instagramUrl} target="_blank" rel="noopener noreferrer" className={classeLink}>
              Instagram @{contato.instagram}
            </a>
          </li>
        </ul>
      </div>
      <p className="px-gutter pb-8 font-corpo text-sm text-chumbo">
        © {new Date().getFullYear()} Menezes Barber’s · {contato.endereco.linha1}, {contato.endereco.linha2}
      </p>
    </footer>
  )
}
