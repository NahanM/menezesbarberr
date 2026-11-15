// Enquanto a sessão (ou a checagem da equipe) não responde: tela preta com uma palavra.
// Evita mostrar o formulário por um instante para quem já está logado.
export default function TelaCarregando() {
  return (
    <div
      role="status"
      className="grid min-h-dvh place-items-center bg-preto font-display text-display-sm tracking-wider text-neon uppercase"
    >
      Carregando
    </div>
  )
}
