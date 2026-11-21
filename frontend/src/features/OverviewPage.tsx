import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, formatCount, formatMoney } from '../lib/api'
import { Badge, Bar, Button, Card, EmptyState, ErrorState, KPI, LoadingState, PageHeader, SectionHeader, StatusBadge } from '../components/ui'

type Capability = {code: string; name: string; status: string; reason?: string}
type Portfolio = {id: string; name: string; version: {deal_count: number; credit_count: number; deposit_count: number}; last_run?: {type: string; status: string; result?: Record<string, unknown>}}

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
  return <>
    <PageHeader crumb="ОБЗОР ПОРТФЕЛЯ" title="Обзор портфеля" description="Финансовые показатели, динамика NPV и состояние аналитической платформы" actions={<Link to="/generator"><Button primary>+ Создать портфель</Button></Link>} />
    <div className="kpi-grid">
      <KPI label="NPV портфеля" value={result.npv ? formatMoney(String(result.npv)) : '—'} sub={result.npv ? `Методика: ${String(result.convention || 'версионируемая')}` : 'Нет полного расчёта CF + DF'} tone="green" icon="◉" />
      <KPI label="Количество сделок" value={formatCount(total)} sub={portfolio ? `${formatCount(portfolio.version.credit_count)} кредитов · ${formatCount(portfolio.version.deposit_count)} депозитов` : 'Создайте первый портфель'} icon="▣" />
      <KPI label="Текущий портфель" value={portfolio ? <span className="current-portfolio-name" title={portfolio.name}>{portfolio.name}</span> : '—'} sub={portfolio ? undefined : 'Нет сохранённых версий'} icon="▤" className="current-portfolio-kpi" />
      <KPI label="Последний расчёт" value={portfolio?.last_run?.status || '—'} sub={portfolio?.last_run ? portfolio.last_run.type : 'Расчёты ещё не запускались'} tone="violet" icon="%" />
    </div>
    <div className="grid main-grid">
      <Card className="chart-large"><SectionHeader title="Динамика NPV" side={<span className="mini-select">Сохранённые расчёты</span>} /><EmptyState title="Недостаточно исторических расчётов" text="Динамика появится только после нескольких реальных NPV на разные даты" icon="⌁" /><div className="legend"><i className="dot blue" /> NPV портфеля <span className="muted">· без синтетической линии</span></div></Card>
      <Card><SectionHeader title="Структура портфеля" side="По количеству сделок" />{portfolio ? <><div className="donut-wrapper"><div className="donut" style={{background: `conic-gradient(#348afa 0 ${creditShare}%, #aa8bf8 ${creditShare}% 100%)`}}><div className="donut-hole"><strong>{formatCount(total)}</strong><span>сделок</span></div></div><div className="legend-col"><div><i className="dot blue"/> Кредиты <strong>{creditShare}%</strong></div><div><i className="dot purple"/> Депозиты <strong>{depositShare}%</strong></div></div></div><SectionHeader title="Состав"/><div className="bar-list"><Bar label="Кредиты" value={creditShare}/><Bar label="Депозиты" value={depositShare} tone="purple"/></div></> : <EmptyState title="Нет портфеля" text="Генератор создаст воспроизводимый набор сделок" big={false} />}</Card>
    </div>
    <div className="grid half-grid">
      <Card><SectionHeader title="Последний факторный анализ" side={<Badge>Только сохранённый результат</Badge>} />{portfolio?.last_run?.type === 'scenario' && result.delta_npv ? <div className="analysis-kpi"><div><span>NPV до</span><strong>{formatMoney(String(result.base_npv))}</strong></div><div className="arrow">→</div><div><span>NPV после</span><strong>{formatMoney(String(result.scenario_npv))}</strong></div><div className="delta negative">{formatMoney(String(result.delta_npv))}</div></div> : <EmptyState title="Сценариев ещё нет" text="Выполните полный NPV и примените сдвиг дисконтной кривой" icon="▥" big={false} />}</Card>
      <Card><SectionHeader title="Возможности платформы" />{capabilities.data?.capabilities.slice(0, 5).map(item => <div className="status-row" key={item.code} title={item.reason}><span>{item.name}</span><StatusBadge status={item.status}/></div>)}</Card>
    </div>
  </>
}
