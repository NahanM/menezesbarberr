// Classes dos botões de navegação (anterior, hoje, próximo) do dia e da semana.

const base =
  'inline-flex min-h-11 min-w-11 items-center justify-center border-2 border-cimento px-4 font-display text-lg tracking-wider uppercase transition-colors duration-rapida ease-urbz'

export const classeBotaoNavegacao = `${base} text-branco hover:border-neon hover:text-neon disabled:cursor-not-allowed disabled:text-chumbo disabled:hover:border-cimento disabled:hover:text-chumbo`

// "Hoje" / "Esta semana" ficam apagados quando já estamos lá: é o estado atual, não uma ação.
export const classeBotaoAtual = `${base} text-chumbo hover:border-neon hover:text-neon`
