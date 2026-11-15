import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// O vercel.json manda o Content-Security-Policy em produção. O script inline do index.html (preload do hero)
// só roda se o hash dele estiver no script-src. Se alguém editar o script e esquecer o hash, o preload
// morre em silêncio; este teste acusa na hora.
const html = readFileSync('index.html', 'utf8')
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const cabecalhos = new Map(config.headers.find((h) => h.source === '/(.*)')?.headers.map((h) => [h.key, h.value]))
const csp = cabecalhos.get('Content-Security-Policy') ?? ''

/** Valor da diretiva (ex.: "script-src" -> "'self' 'sha256-...'"). */
function diretiva(nome: string): string {
  const d = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${nome} `) || s === nome)
  if (d === undefined) throw new Error(`CSP sem a diretiva ${nome}`)
  return d.slice(nome.length).trim()
}

/** Scripts inline = <script> sem atributo src (os com src são arquivos, cobertos por 'self'). */
function scriptsInline(fonte: string = html): string[] {
  return [...fonte.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
}

describe('vercel.json: CSP e cabeçalhos', () => {
  it('todo <script> inline do index.html tem o hash sha256 no script-src', () => {
    const inline = scriptsInline()
    expect(inline.length).toBeGreaterThan(0)
    const permitidos = diretiva('script-src').split(/\s+/)
    for (const codigo of inline) {
      const hash = `'sha256-${createHash('sha256').update(codigo).digest('base64')}'`
      expect(permitidos, `hash ${hash} ausente no script-src`).toContain(hash)
    }
  })

  // O Vite reescreve o HTML no build: o que vai ao ar é o dist/index.html, não o de origem.
  it.skipIf(!existsSync('dist/index.html'))('todo <script> inline do dist/index.html (build) também está no script-src', () => {
    const inline = scriptsInline(readFileSync('dist/index.html', 'utf8'))
    expect(inline.length).toBeGreaterThan(0)
    const permitidos = diretiva('script-src').split(/\s+/)
    for (const codigo of inline) {
      const hash = `'sha256-${createHash('sha256').update(codigo).digest('base64')}'`
      expect(permitidos, `hash ${hash} do build ausente no script-src`).toContain(hash)
    }
  })

  it('o script-src não tem hash sobrando nem unsafe-inline/unsafe-eval', () => {
    const hashes = diretiva('script-src')
      .split(/\s+/)
      .filter((t) => t.startsWith("'sha256-"))
    expect(hashes).toHaveLength(scriptsInline().length)
    expect(csp).not.toContain('unsafe-eval')
    expect(diretiva('script-src')).not.toContain('unsafe-inline')
  })

  it('o connect-src libera só o host do Supabase do VITE_SUPABASE_URL', (ctx) => {
    const url = process.env.VITE_SUPABASE_URL
    if (!url) {
      // No CI a variável é obrigatória: pular em silêncio esconderia um host errado.
      if (process.env.CI) throw new Error('VITE_SUPABASE_URL não definida no CI')
      return ctx.skip()
    }
    expect(diretiva('connect-src').split(/\s+/)).toEqual(["'self'", new URL(url).origin])
  })

  it('bloqueia frames e plugins e restringe base, form e origem padrão', () => {
    expect(diretiva('default-src')).toBe("'self'")
    expect(diretiva('frame-src')).toBe("'none'")
    expect(diretiva('frame-ancestors')).toBe("'none'")
    expect(diretiva('object-src')).toBe("'none'")
    expect(diretiva('base-uri')).toBe("'self'")
    expect(diretiva('form-action')).toBe("'self'")
  })

  it('manda os outros cabeçalhos de segurança e o rewrite de SPA', () => {
    expect(cabecalhos.get('X-Frame-Options')).toBe('DENY')
    expect(cabecalhos.get('X-Content-Type-Options')).toBe('nosniff')
    expect(cabecalhos.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(cabecalhos.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('o rewrite de SPA cobre as rotas do app e deixa arquivos e /assets/ darem 404', () => {
    const regra = config.rewrites.find((r) => r.destination === '/index.html')
    expect(regra).toBeDefined()
    // Vercel usa path-to-regexp; para este padrão (grupo com lookahead) a RegExp do JS se comporta igual.
    const casa = (caminho: string) => new RegExp(`^${regra!.source}$`).test(caminho)
    for (const rota of ['/', '/agendar', '/agendar/sucesso', '/painel', '/rota-que-nao-existe']) {
      expect(casa(rota), rota).toBe(true)
    }
    for (const arquivo of ['/assets/index-abc.js', '/assets/fotos/x.webp', '/assets/nao-existe', '/robots.txt', '/favicon.ico']) {
      expect(casa(arquivo), arquivo).toBe(false)
    }
  })
})
