import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, formatCount, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorState, KPI, LoadingState, PageHeader, SectionHeader, Select, StatusBadge, Tabs } from '../components/ui'

type PortfolioList = {id: string; name: string; version: {deal_count: number; credit_count: number; deposit_count: number; valuation_date: string}; last_run?: Run}
type Run = {run_id: string; status: string; result?: Record<string, unknown>}
type PortfolioDetail = {id: string; name: string; version: {id: string; valuation_date: string}; stats: {kind: string; count: number; principal: string}[]; runs: Run[]}
type Deal = {id: string; deal_id: string; kind: string; discriminator: string; rate_type: string; principal: string; interest_rate: string; maturity_date: string; validation_status: string}

export function PortfolioPage() {
  const {portfolioId} = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'deals'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [snapshot, setSnapshot] = useState('')
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<PortfolioList[]>('/portfolios')})
  const selectedId = portfolioId || portfolios.data?.[0]?.id
  const detail = useQuery({queryKey: ['portfolio', selectedId], queryFn: () => api<PortfolioDetail>(`/portfolios/${selectedId}`), enabled: !!selectedId})
  const deals = useQuery({queryKey: ['deals', selectedId, search], queryFn: () => api<{items: Deal[]; total: number; pages: number}>(`/portfolios/${selectedId}/deals?page_size=25&search=${encodeURIComponent(search)}`), enabled: !!selectedId && tab === 'deals'})
  const curves = useQuery({queryKey: ['curves'], queryFn: () => api<{id: string; source: string; trade_date: string}[]>('/curves')})
  const calculation = useMutation({mutationFn: () => api<Run>(`/portfolios/${selectedId}/calculate`, {method: 'POST', body: JSON.stringify({snapshot_id: snapshot || null})}), onSuccess: async () => {await queryClient.invalidateQueries({queryKey: ['portfolio', selectedId]}); await queryClient.invalidateQueries({queryKey: ['runs']})}})
  if (portfolios.isLoading) return <LoadingState />
  if (portfolios.error) return <ErrorState message={(portfolios.error as Error).message}/>
  if (!selectedId) return <><PageHeader crumb="ПОРТФЕЛЬ" title="Портфель" description="Реестр кредитных и депозитных сделок, расчёты и финансовые показатели"/><Card><EmptyState title="Портфелей пока нет" text="Создайте воспроизводимый портфель в генераторе"/><div className="center-actions"><Link to="/generator"><Button primary>Открыть генератор</Button></Link></div></Card></>
  if (detail.isLoading) return <LoadingState/>
  if (detail.error) return <ErrorState message={(detail.error as Error).message}/>
  const data = detail.data!
  const credit = data.stats.find(item => item.kind === 'credit')
  const deposit = data.stats.find(item => item.kind === 'deposit')
  const last = data.runs.find(run => run.result?.npv)
  const tabItems = [{key: 'deals', label: 'Сделки'}, {key: 'cashflows', label: 'Денежные потоки'}, {key: 'structure', label: 'Структура'}, {key: 'runs', label: 'История расчётов'}]
  return <>
    <PageHeader crumb="ПОРТФЕЛЬ" title="Портфель" description="Реестр кредитных и депозитных сделок, расчёты и финансовые показатели" actions={<><a href={`/api/portfolios/${selectedId}/export`}><Button>Экспорт CSV</Button></a><Button primary onClick={() => calculation.mutate()} disabled={calculation.isPending} title={!snapshot ? 'Без снимка будут рассчитаны только денежные потоки' : undefined}>▶ {calculation.isPending ? 'Расчёт…' : 'Рассчитать портфель'}</Button></>} />
    {calculation.error && <ErrorState message={(calculation.error as Error).message}/>}
    <div className="select-strip"><Select value={selectedId} onChange={event => navigate(`/portfolios/${event.target.value}`)}>{portfolios.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><span className="select-box">Дата оценки <strong>{formatDate(data.version.valuation_date)}</strong></span><Select value={snapshot} onChange={event => setSnapshot(event.target.value)}><option value="">CF без NPV · снимок не выбран</option>{curves.data?.map(item => <option value={item.id} key={item.id}>{item.trade_date} · {item.source}</option>)}</Select><StatusBadge status={data.runs[0]?.status || 'Ожидает расчёта'}/></div>
    <div className="kpi-grid"><KPI label="Всего сделок" value={formatCount((credit?.count || 0) + (deposit?.count || 0))} sub={`Кредиты: ${formatCount(credit?.count)} · депозиты: ${formatCount(deposit?.count)}`} icon="▣"/><KPI label="Кредитные остатки" value={formatMoney(credit?.principal)} sub="Активы банка" icon="▤"/><KPI label="Депозитные остатки" value={formatMoney(deposit ? Math.abs(Number(deposit.principal)) : null)} sub="Обязательства банка · показаны по модулю" tone="violet" icon="◫"/><KPI label="NPV портфеля" value={last?.result?.npv ? formatMoney(String(last.result.npv)) : '—'} sub={last ? `Запуск ${last.run_id.slice(0, 8)}` : 'Нужны полные CF и DF'} tone="green" icon="↗"/></div>
    <Tabs items={tabItems.map(item => ({label: item.label, to: `/portfolios/${selectedId}${item.key === 'deals' ? '' : `?tab=${item.key}`}`, active: tab === item.key}))}/>
    {tab === 'deals' && <Card><SectionHeader title="Реестр сделок" side={`${formatCount(deals.data?.total)} записей`}/><div className="filters"><input className="search native-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по ID или продукту"/><span className="filter-chip">Тип сделки ⌄</span><span className="filter-chip">Ставка ⌄</span><span className="filter-chip">График ⌄</span><span className="filter-chip">Статус ⌄</span></div>{deals.isLoading ? <LoadingState/> : <div className="table-scroll"><table className="data-table"><thead><tr><th>ID сделки</th><th>Тип</th><th>Остаток</th><th>Погашение</th><th>Ставка</th><th>График</th><th>Валидация</th><th></th></tr></thead><tbody>{deals.data?.items.map(deal => <tr key={deal.id}><td><Link className="link" to={`/portfolios/${selectedId}/deals/${deal.id}`}>{deal.deal_id}</Link></td><td><Badge tone={deal.kind === 'credit' ? 'blue' : 'purple'}>{deal.kind === 'credit' ? 'Кредит' : 'Депозит'}</Badge></td><td>{formatMoney(Math.abs(Number(deal.principal)))}</td><td>{formatDate(deal.maturity_date)}</td><td>{deal.rate_type === 'FLOAT' ? `CBKEY1M + ${formatPercentFromDecimal(deal.interest_rate)}` : formatPercentFromDecimal(deal.interest_rate)}</td><td>{deal.discriminator}</td><td><StatusBadge status={deal.validation_status === 'valid' ? 'Доступно' : deal.validation_status}/></td><td><Link to={`/portfolios/${selectedId}/deals/${deal.id}`}>↗</Link></td></tr>)}</tbody></table></div>}<div className="pagination"><span>Показано {deals.data?.items.length || 0} из {deals.data?.total || 0}</span><span><b>1</b> · {deals.data?.pages || 1}</span></div></Card>}
    {tab === 'cashflows' && <Card><SectionHeader title="Денежные потоки портфеля"/><EmptyState title={data.runs.some(run => Number(run.result?.cashflow_event_count) > 0) ? 'Потоки сохранены по сделкам' : 'Денежные потоки ещё не рассчитаны'} text="Откройте карточку сделки для исходных событий cfgen или запустите расчёт портфеля" icon="⌁"/></Card>}
    {tab === 'structure' && <div className="grid half-grid"><Card><SectionHeader title="Инструменты"/><div className="bar-list"><div className="status-row"><span>Кредиты</span><b>{credit?.count || 0}</b></div><div className="status-row"><span>Депозиты</span><b>{deposit?.count || 0}</b></div></div></Card><Card><SectionHeader title="Версия данных"/><div className="kv"><span>ID версии</span><b>{data.version.id}</b></div><div className="kv"><span>Дата оценки</span><b>{formatDate(data.version.valuation_date)}</b></div></Card></div>}
    {tab === 'runs' && <Card><SectionHeader title="История расчётов" side={`${data.runs.length} запусков`}/>{data.runs.length ? <table className="data-table"><thead><tr><th>ID</th><th>Статус</th><th>Результат</th></tr></thead><tbody>{data.runs.map(run => <tr key={run.run_id}><td>{run.run_id}</td><td><StatusBadge status={run.status}/></td><td>{run.result?.npv ? formatMoney(String(run.result.npv)) : String(run.result?.valuation_reason || run.result?.cashflow_status || '—')}</td></tr>)}</tbody></table> : <EmptyState title="Расчётов ещё нет" text="Старые результаты не перезаписываются — каждый запуск появится здесь"/>}</Card>}
  </>
}
