// Funções puras de formatação. Sem React, sem rede: fáceis de testar.

/** Converte centavos em texto de preço brasileiro. 8000 vira "R$ 80,00". */
export function formatarPreco(centavos: number): string {
  const reais = centavos / 100
  // Intl usa espaço não separável entre "R$" e o número; trocamos por espaço comum
  // para o texto sair igual em qualquer navegador (e no teste).
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(reais)
    .replace(/\s/g, ' ')
}

/** Duração em minutos para texto curto. 75 vira "1h15", 45 vira "45 min", 60 vira "1h". */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
}
