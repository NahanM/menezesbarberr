interface Props {
  className?: string
}

// "Mapa" gráfico desenhado em SVG: ruas em linhas finas (no ângulo das listras) e um pin neon.
// É ilustração, não um mapa real: a CSP do site bloqueia iframe (frame-src 'none'), então não há
// mapa embutido. O link ao lado abre o endereço no Google Maps.
// Cores só por tokens (currentColor + classes do Tailwind).
export default function MapaEstilizado({ className = '' }: Props) {
  return (
    <figure className={`relative overflow-hidden bg-concreto ${className}`}>
      <svg
        viewBox="0 0 500 400"
        role="img"
        aria-label="Mapa ilustrativo: ruas em linhas finas e o pin da Menezes"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* Quarteirões e ruas */}
        <g fill="none" stroke="currentColor" strokeWidth="1" className="text-cimento">
          <path d="M-20 80 L520 40" />
          <path d="M-20 170 L520 150" />
          <path d="M-20 280 L520 300" />
          <path d="M-20 360 L520 330" />
          <path d="M80 -20 L110 420" />
          <path d="M200 -20 L190 420" />
          <path d="M330 -20 L360 420" />
          <path d="M440 -20 L430 420" />
        </g>
        {/* Avenida diagonal, no ângulo das listras */}
        <g fill="none" stroke="currentColor" strokeWidth="2" className="text-chumbo">
          <path d="M-20 420 L420 -20" />
        </g>
        {/* Praça */}
        <rect x="215" y="185" width="95" height="80" fill="none" stroke="currentColor" strokeWidth="1" className="text-chumbo" strokeDasharray="4 4" />
        {/* Pin neon + onda fina */}
        <g className="text-neon" fill="currentColor" stroke="currentColor">
          <circle cx="262" cy="225" r="26" fill="none" strokeWidth="1" />
          <path d="M262 247 L250 212 a14 14 0 1 1 24 0 Z" stroke="none" />
          <circle cx="262" cy="205" r="5" className="text-preto" fill="currentColor" stroke="none" />
        </g>
      </svg>
      <figcaption className="absolute bottom-3 left-3 bg-preto px-2 py-1 font-corpo text-xs tracking-widest text-chumbo uppercase">
        Mapa ilustrativo
      </figcaption>
    </figure>
  )
}
