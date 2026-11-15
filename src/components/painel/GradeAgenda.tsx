import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.ts'
import type { DiaISO } from '../../lib/agendar/datas.ts'
import {
  distribuirFaixas,
  contaComoAgendado,
  type Agendamento,
  type Bloqueio,
  posicaoNaGrade,
  etiquetaAgoraCobreHora,
  rotuloMinutos,
  type Grade,
} from '../../lib/painel/agenda.ts'
import { textoColunaVazia, type ColunaFiltrada } from '../../lib/painel/cancelados.ts'
import BlocoAgendamento from './BlocoAgendamento.tsx'
import BlocoBloqueio from './BlocoBloqueio.tsx'

interface Props {
  colunas: ColunaFiltrada[]
  grade: Grade
  dia: DiaISO
  /** Minutos desde a meia-noite agora, ou null se o dia mostrado não é hoje. */
  agoraMin: number | null
  /** Barbeiro da aba escolhida no celular. Mora no pai para sobreviver ao "carregando" ao trocar de dia. */
  escolhida: string | null
  aoEscolher: (barbeiroId: string) => void
  /** Clique num agendamento: abre os detalhes. */
  aoAbrir: (agendamento: Agendamento, botao: HTMLButtonElement) => void
  /** Clique num bloqueio: abre os detalhes (onde dá para remover). */
  aoAbrirBloqueio: (bloqueio: Bloqueio, botao: HTMLButtonElement) => void
}

// Mesmo ponto de corte do breakpoint md do Tailwind (48rem): de md para cima não há abas.
const CONSULTA_ABAS = '(max-width: 47.99rem)'

const hh = (hora: number) => `${String(hora).padStart(2, '0')}:00`

// Altura da área das horas = quantidade de horas × altura de uma hora (token --spacing-hora).
function alturaDaGrade(grade: Grade): CSSProperties {
  return { height: `calc(${grade.horas.length} * var(--spacing-hora))` }
}

function Coluna({
  coluna,
  grade,
  dia,
  agoraMin,
  visivelNoCelular,
  comAbas,
  aoAbrir,
  aoAbrirBloqueio,
}: { coluna: ColunaFiltrada; visivelNoCelular: boolean; comAbas: boolean } & Pick<
  Props,
  'grade' | 'dia' | 'agoraMin' | 'aoAbrir' | 'aoAbrirBloqueio'
>) {
  const faixas = distribuirFaixas(coluna.agendamentos)
  const ativos = coluna.agendamentos.filter((a) => contaComoAgendado(a.status)).length
  const total = grade.fimMin - grade.inicioMin
  const textoVazio = textoColunaVazia(coluna)

  return (
    <section
      id={`coluna-${coluna.barbeiroId}`}
      // Com abas (celular) a coluna é o painel da aba; sem abas (desktop) é só uma região da página.
      {...(comAbas
        ? { role: 'tabpanel', 'aria-labelledby': `aba-${coluna.barbeiroId}` }
        : { 'aria-label': `Agenda de ${coluna.nome}` })}
      className={`min-w-0 flex-col border-l border-cimento ${visivelNoCelular ? 'flex' : 'hidden md:flex'}`}
    >
      {/* Cabeçalho da coluna (desktop; no celular as abas fazem esse papel). Cola no topo ao rolar. */}
      <header className="sticky top-0 z-20 hidden h-12 items-end justify-between gap-2 border-b border-cimento bg-preto px-2 pb-1 md:flex">
        <h2 className="truncate text-2xl">{coluna.nome}</h2>
        <span className="shrink-0 font-corpo text-sm text-chumbo">
          {ativos} {ativos === 1 ? 'agendamento' : 'agendamentos'}
        </span>
      </header>
      <div className="linhas-de-hora relative" style={alturaDaGrade(grade)}>
        {coluna.bloqueios.map((k) => {
          const posicao = posicaoNaGrade(grade, dia, k.inicio, k.fim)
          return (
            posicao && (
              <BlocoBloqueio key={k.id} bloqueio={k} posicao={posicao} aoAbrir={(botao) => aoAbrirBloqueio(k, botao)} />
            )
          )
        })}
        {coluna.agendamentos.map((a) => {
          const posicao = posicaoNaGrade(grade, dia, a.inicio, a.fim)
          const faixa = faixas.get(a.id)
          return (
            posicao &&
            faixa && (
              <BlocoAgendamento
                key={a.id}
                agendamento={a}
                posicao={posicao}
                faixa={faixa}
                aoAbrir={(botao) => aoAbrir(a, botao)}
              />
            )
          )
        })}
        {textoVazio !== null && (
          <p className="absolute inset-x-0 top-3 px-2 text-center font-corpo text-xs tracking-widest text-chumbo uppercase">
            {textoVazio}
          </p>
        )}
        {agoraMin !== null && agoraMin >= grade.inicioMin && agoraMin < grade.fimMin && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 z-[5] h-px bg-neon"
            style={{ top: `${((agoraMin - grade.inicioMin) / total) * 100}%` }}
          />
        )}
      </div>
    </section>
  )
}

/**
 * A agenda do dia: eixo de horas à esquerda e uma coluna por barbeiro.
 * No celular não dá para espremer as colunas: aparecem abas (uma por barbeiro) e só a coluna
 * escolhida fica visível, ocupando a largura toda. Do breakpoint md para cima, todas lado a lado.
 */
export default function GradeAgenda({
  colunas,
  grade,
  dia,
  agoraMin,
  escolhida,
  aoEscolher,
  aoAbrir,
  aoAbrirBloqueio,
}: Props) {
  const comAbas = useMediaQuery(CONSULTA_ABAS)
  const agoraNaGrade = agoraMin !== null && agoraMin >= grade.inicioMin && agoraMin < grade.fimMin ? agoraMin : null
  const abas = useRef(new Map<string, HTMLButtonElement>())
  // Se a escolhida não existe mais (ou nunca houve escolha), vale a primeira.
  const ativaId = colunas.some((c) => c.barbeiroId === escolhida) ? escolhida : (colunas[0]?.barbeiroId ?? null)

  // Setas, Home e End movem entre as abas (padrão de abas acessíveis); só a aba ativa entra no Tab.
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const ultimo = colunas.length - 1
    const destino =
      e.key === 'ArrowRight' ? (indice === ultimo ? 0 : indice + 1)
      : e.key === 'ArrowLeft' ? (indice === 0 ? ultimo : indice - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ultimo
      : null
    if (destino === null) return
    e.preventDefault()
    const id = colunas[destino].barbeiroId
    aoEscolher(id)
    abas.current.get(id)?.focus()
  }

  return (
    <div>
      {/* A etiqueta da linha "agora" é só visual (a calha das horas é aria-hidden); este texto diz a mesma hora a quem usa leitor de tela. */}
      {agoraNaGrade !== null && <p className="sr-only">Agora: {rotuloMinutos(agoraNaGrade)}</p>}
      <div
        role="tablist"
        aria-label="Barbeiros"
        className="sticky top-0 z-30 flex overflow-x-auto border-b border-cimento bg-preto md:hidden"
      >
        {colunas.map((c, i) => {
          const selecionada = c.barbeiroId === ativaId
          const ativos = c.agendamentos.filter((a) => contaComoAgendado(a.status)).length
          return (
            <button
              key={c.barbeiroId}
              ref={(el) => {
                if (el) abas.current.set(c.barbeiroId, el)
                else abas.current.delete(c.barbeiroId)
              }}
              type="button"
              role="tab"
              id={`aba-${c.barbeiroId}`}
              aria-label={`${c.nome}, ${ativos} ${ativos === 1 ? 'agendamento' : 'agendamentos'}`}
              aria-selected={selecionada}
              aria-controls={`coluna-${c.barbeiroId}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => aoEscolher(c.barbeiroId)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={`flex min-h-12 min-w-20 flex-1 items-center justify-center gap-1.5 border-b-4 px-2 font-display text-xl tracking-wider uppercase transition-colors duration-rapida ease-urbz ${
                selecionada ? 'border-neon text-branco' : 'border-transparent text-chumbo hover:text-branco'
              }`}
            >
              {c.nome}
              <span aria-hidden="true" className="font-corpo text-sm tracking-normal">
                {ativos}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-cimento md:grid-cols-[3.5rem_repeat(var(--colunas),minmax(0,1fr))]"
        style={{ '--colunas': colunas.length } as CSSProperties}
      >
        {/* Eixo das horas */}
        <div aria-hidden="true" className="min-w-0">
          <div className="hidden h-12 md:block" />
          <div className="relative" style={alturaDaGrade(grade)}>
            {grade.horas.map((hora, i) => (
              <span
                key={hora}
                className={`absolute inset-x-0 pt-0.5 pr-2 text-right font-corpo text-xs text-chumbo ${
                  agoraNaGrade !== null && etiquetaAgoraCobreHora(agoraNaGrade, hora) ? 'invisible' : ''
                }`}
                style={{ top: `calc(${i} * var(--spacing-hora))` }}
              >
                {hh(hora)}
              </span>
            ))}
            {agoraNaGrade !== null && (
              // Etiqueta neon no início da linha "agora": a linha fina se perde sobre blocos e hachuras, a hora não.
              <span
                className="absolute right-0 z-10 -translate-y-1/2 bg-neon px-1.5 py-0.5 font-corpo text-xs leading-none font-bold text-preto"
                style={{ top: `${((agoraNaGrade - grade.inicioMin) / (grade.fimMin - grade.inicioMin)) * 100}%` }}
              >
                {rotuloMinutos(agoraNaGrade)}
              </span>
            )}
          </div>
        </div>
        {colunas.map((c) => (
          <Coluna
            key={c.barbeiroId}
            coluna={c}
            grade={grade}
            dia={dia}
            agoraMin={agoraMin}
            visivelNoCelular={c.barbeiroId === ativaId}
            comAbas={comAbas}
            aoAbrir={aoAbrir}
            aoAbrirBloqueio={aoAbrirBloqueio}
          />
        ))}
      </div>
    </div>
  )
}
