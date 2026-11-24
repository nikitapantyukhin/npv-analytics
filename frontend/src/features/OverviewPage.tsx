import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Briefcase, ChartSpline, Hash, Plus, Wallet } from 'lucide-react'
import { api, formatCount, formatMoney } from '../lib/api'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KPI, LoadingState, PageHeader, StatusBadge } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { chartColors } from '../components/charts/chartTheme'
import { cn } from '../lib/utils'

type Capability = {code: string; name: string; status: string; reason?: string}
type Portfolio = {id: string; name: string; version: {deal_count: number; credit_count: number; deposit_count: number}; last_run?: {type: string; status: string; result?: Record<string, unknown>}}

function StructureBar({label, value, color}: {label: string; value: number; color: string}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted mb-1.5">
        <span>{label}</span>
        <b className="text-foreground tnum">{value}%</b>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{width: `${Math.min(100, Math.max(0, value))}%`, background: color}} />
      </div>
    </div>
  )
}

export function OverviewPage() {
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<Portfolio[]>('/portfolios')})
  const capabilities = useQuery({queryKey: ['capabilities'], queryFn: () => api<{capabilities: Capability[]}>('/capabilities')})
  if (portfolios.isLoading) return <LoadingState />
  if (portfolios.error) return <ErrorState message={(portfolios.error as Error).message} />
  const portfolio = portfolios.data?.[0]
  const result = portfolio?.last_run?.result || {}
  const total = portfolio?.version.deal_count || 0
  const creditShare = total ? Math.round((portfolio!.version.credit_count / total) * 100) : 0
  const depositShare = total ? 100 - creditShare : 0
  const hasScenario = portfolio?.last_run?.type === 'scenario' && result.delta_npv != null
  return (
    <>
      <PageHeader
        crumb="ОБЗОР ПОРТФЕЛЯ"
        title="Обзор портфеля"
        description="Финансовые показатели, динамика NPV и состояние аналитической платформы"
        actions={<Link to="/generator"><Button variant="primary" size="lg"><Plus size={17} strokeWidth={2.2} /> Создать портфель</Button></Link>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KPI accent icon={Wallet} label="NPV портфеля" value={result.npv ? formatMoney(String(result.npv)) : '—'} sub={result.npv ? `Методика: ${String(result.convention || 'версионируемая')}` : 'Нет полного расчёта CF + DF'} />
        <KPI icon={Hash} label="Количество сделок" value={formatCount(total)} sub={portfolio ? `${formatCount(portfolio.version.credit_count)} кредитов · ${formatCount(portfolio.version.deposit_count)} депозитов` : 'Создайте первый портфель'} />
        <KPI icon={Briefcase} label="Текущий портфель" value={<span className="text-[19px] leading-tight">{portfolio?.name || '—'}</span>} sub={portfolio ? `ID ${portfolio.id.slice(0, 8)}` : 'Нет сохранённых версий'} />
        <KPI icon={Activity} label="Последний расчёт" value={portfolio?.last_run?.status || '—'} sub={portfolio?.last_run ? portfolio.last_run.type : 'Расчёты ещё не запускались'} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5 mb-5">
        <Card>
          <CardHeader title="Динамика NPV" side={<Badge tone="outline">Сохранённые расчёты</Badge>} />
          <EmptyState
            icon={ChartSpline}
            title="Недостаточно исторических расчётов"
            text="Динамика появится только после нескольких реальных NPV на разные даты — синтетическая линия не подставляется"
          />
        </Card>
        <Card>
          <CardHeader title="Структура портфеля" side="По количеству сделок" />
          {portfolio ? (
            <>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="relative w-[190px] h-[190px] shrink-0 mx-auto">
                  <Chart
                    height={190}
                    option={{
                      tooltip: {trigger: 'item'},
                      legend: {show: false},
                      series: [{
                        type: 'pie',
                        radius: ['72%', '92%'],
                        avoidLabelOverlap: false,
                        label: {show: false},
                        emphasis: {scale: false},
                        itemStyle: {borderColor: '#171717', borderWidth: 3, borderRadius: 6},
                        data: [
                          {name: 'Кредиты', value: portfolio.version.credit_count, itemStyle: {color: chartColors.lime}},
                          {name: 'Депозиты', value: portfolio.version.deposit_count, itemStyle: {color: chartColors.olive}},
                        ],
                      }],
                    }}
                  />
                  <div className="absolute inset-0 grid place-items-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-[22px] font-bold tnum leading-none">{formatCount(total)}</div>
                      <div className="text-[11px] text-faint mt-1">сделок</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-[130px]">
                  {[{name: 'Кредиты', share: creditShare, color: chartColors.lime}, {name: 'Депозиты', share: depositShare, color: chartColors.olive}].map(row => (
                    <div key={row.name} className="flex items-center gap-2 py-2.5 border-b border-border last:border-0 text-[12.5px]">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: row.color}} />
                      <span className="text-muted">{row.name}</span>
                      <b className="ml-auto tnum">{row.share}%</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3.5">
                <StructureBar label="Кредиты" value={creditShare} color={chartColors.lime} />
                <StructureBar label="Депозиты" value={depositShare} color={chartColors.olive} />
              </div>
            </>
          ) : (
            <EmptyState compact title="Нет портфеля" text="Генератор создаст воспроизводимый набор сделок" />
          )}
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Последний факторный анализ" side={<Badge tone="outline">Только сохранённый результат</Badge>} />
          {hasScenario ? (
            <div className="flex items-center justify-between gap-4 flex-wrap py-3">
              <div>
                <span className="block text-[11px] text-faint mb-1.5">NPV до</span>
                <strong className="text-[22px] tnum">{formatMoney(String(result.base_npv))}</strong>
              </div>
              <ArrowRight size={26} className="text-faint shrink-0" />
              <div>
                <span className="block text-[11px] text-faint mb-1.5">NPV после</span>
                <strong className="text-[22px] tnum">{formatMoney(String(result.scenario_npv))}</strong>
              </div>
              <span className={cn('text-[19px] font-bold tnum', Number(result.delta_npv) < 0 ? 'text-red' : 'text-lime')}>
                {formatMoney(String(result.delta_npv))}
              </span>
            </div>
          ) : (
            <EmptyState compact title="Сценариев ещё нет" text="Выполните полный NPV и примените сдвиг дисконтной кривой" />
          )}
        </Card>
        <Card>
          <CardHeader title="Возможности платформы" side="Честные статусы" />
          <div>
            {capabilities.data?.capabilities.slice(0, 5).map(item => (
              <div key={item.code} title={item.reason} className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0 text-[12.5px]">
                <span>{item.name}</span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
