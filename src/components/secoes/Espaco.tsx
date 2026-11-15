import Foto from '../Foto.tsx'
import { comodidades } from '../../data/barbearia.ts'

// "O espaço": só fotos REAIS do salão. Nenhuma imagem gerada por IA entra nesta seção
// (as do topo são ilustração; aqui o cliente precisa ver o lugar de verdade).
// Para trocar ou acrescentar foto, veja "Fotos" no README.
export default function Espaco() {
  return (
    <section id="espaco" className="scroll-mt-16 overflow-x-clip bg-asfalto py-16 md:py-secao">
      <div className="grid items-start gap-10 px-gutter md:grid-cols-12 md:gap-12">
        <div className="md:col-span-7">
          <Foto
            nome="salao"
            alt="Interior da barbearia: cadeiras pretas, espelhos em arco com luz dourada, parede azul-escura e piso de madeira"
            sizes="(min-width: 768px) 56vw, 100vw"
            className="aspect-[16/9] w-full rounded-sm object-cover"
          />
        </div>
        <div className="md:col-span-5">
          <h2 className="text-display-md">O espaço</h2>
          <p className="mt-6 max-w-md font-corpo text-lg text-cinza-claro">
            Espelhos em arco com luz dourada, parede azul-escura e piso de madeira, no Centro de Pato Branco.
          </p>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 font-corpo text-branco">
            {comodidades.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-neon" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
