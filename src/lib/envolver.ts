/**
 * Mantém `valor` dentro de [min, max) dando a volta (como um relógio).
 * envolver(-25, 0, 3) = -22 ; envolver(-25, 0, -26) = -1.
 * Usada pelo marquee: o deslocamento cresce sem parar, mas a faixa só precisa
 * andar um "período" antes de se repetir de forma idêntica.
 */
export function envolver(min: number, max: number, valor: number): number {
  const faixa = max - min
  return ((((valor - min) % faixa) + faixa) % faixa) + min
}
