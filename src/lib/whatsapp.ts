/**
 * Monta o link wa.me com o texto já codificado.
 * `numero` aceita qualquer formato ("+55 (11) 99999-0000"): só os dígitos são usados.
 * O texto passa por encodeURIComponent, então acentos, espaços e "&" não quebram a URL.
 */
export function linkWhatsApp(numero: string, texto?: string): string {
  const digitos = numero.replace(/\D/g, '')
  const base = `https://wa.me/${digitos}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}
