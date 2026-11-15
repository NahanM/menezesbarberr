interface Props {
  className?: string
  /** Nome acessível. Sem ele o logo é decorativo (use quando o nome já está em texto ou no link ao redor). */
  titulo?: string
}

// Logo da MENEZES BARBER's em círculo. O arquivo (public/assets/logo.png, 224x224) veio da página da
// barbearia no AppBarber: marca grafite sobre amarelo. TODO: pedir o logo original ao dono.
// A altura vem de quem usa (ex.: h-10); a largura acompanha, porque o arquivo é quadrado.
// self-start e shrink-0: dentro de um flex em coluna a imagem esticaria na largura e viraria uma pílula.
export default function Logo({ className = '', titulo }: Props) {
  return (
    <img
      src="/assets/logo.png"
      width={224}
      height={224}
      alt={titulo ?? ''}
      className={`inline-block aspect-square w-auto shrink-0 self-start rounded-full ${className}`}
    />
  )
}
