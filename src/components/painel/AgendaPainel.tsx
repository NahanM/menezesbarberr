import { useSearchParams } from 'react-router'
import { useAgora } from '../../hooks/useAgora.ts'
import { useCancelados } from '../../hooks/useCancelados.ts'
import { hojeEmSP, type DiaISO } from '../../lib/agendar/datas.ts'
import { lerDia } from '../../lib/painel/agenda.ts'
import { montarBuscaPainel } from '../../lib/painel/busca.ts'
import SeletorVisao, { type Visao } from './SeletorVisao.tsx'
import VisaoDia from './VisaoDia.tsx'
import VisaoSemana from './VisaoSemana.tsx'

// Agenda do /painel. A visão e o dia moram na URL (?visao=semana&dia=AAAA-MM-DD): dá para recarregar,
// voltar e mandar o link. Sem `visao` (ou valor desconhecido) é o Dia; `dia` inválido ou ausente cai em hoje.
// O filtro ?cancelados=1 é da visão Dia, mas vai junto ao navegar para não se perder.
export default function AgendaPainel() {
  const [params, setParams] = useSearchParams()
  const agora = useAgora()
  const hoje = hojeEmSP(new Date(agora))
  const dia = lerDia(params.get('dia'), hoje)
  const visao: Visao = params.get('visao') === 'semana' ? 'semana' : 'dia'

  // A montagem da URL (e o filtro que vai junto) fica em montarBuscaPainel, igual à do cartão e do resumo.
  const cancelados = useCancelados()
  const ir = (novaVisao: Visao, novoDia: DiaISO) => setParams(montarBuscaPainel(novaVisao, novoDia, cancelados))

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <SeletorVisao visao={visao} aoMudar={(v) => ir(v, dia)} />
      </div>
      {visao === 'semana' ? (
        <VisaoSemana dia={dia} hoje={hoje} aoIrPara={(d) => ir('semana', d)} />
      ) : (
        <VisaoDia dia={dia} hoje={hoje} agora={agora} aoIrPara={(d) => ir('dia', d)} />
      )}
    </div>
  )
}
