import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, ChartSpline, CircleAlert, Info, Percent, TrendingUp, Wallet } from 'lucide-react'
import { api, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { useValuations } from '../lib/calculations'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KPI, LoadingState, PageHeader, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { DiscountDetail, useDiscountBreakdown } from '../components/DiscountDetail'
import { chartColors, limeAreaSeries, roundedBarSeries } from '../components/charts/chartTheme'

type Deal = {id: string; deal_id: string; portfolio_id: string; kind: string; discriminator: string; rate_type: string; principal: string; interest_rate: string; deal_date: string; maturity_date: string; raw_fields: Record<string, string>; validation_status: string; valuation?: {npv: string; pv: string}}
type Cashflow = {event_order: number; payment_date: string; payment_type: string; stream: string; amount: string; principal_before?: string; principal_after?: string; rate?: string}

export function DealPage() {
  const {portfolioId, dealId} = useParams()
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'payments'
  const deal = useQuery({queryKey: ['deal', dealId], queryFn: () => api<Deal>(`/deals/${dealId}`)})
  const flows = useQuery({queryKey: ['deal-flows', dealId], queryFn: () => api<{run_id?: string; items: Cashflow[]}>(`/deals/${dealId}/cashflows`), enabled: !!dealId})
  if (deal.isLoading) return <LoadingState />
  if (deal.error) return <ErrorState message={(deal.error as Error).message} />
  const item = deal.data!
  const discountLink = `/curves?${new URLSearchParams({tab: 'discount', portfolio: item.portfolio_id, deal: item.id})}`
  const tabs = [{key: 'general', label: 'Общие сведения'}, {key: 'payments', label: 'График платежей'}, {key: 'npv', label: 'NPV и дисконтирование'}, {key: 'raw', label: 'Исходные данные'}, {key: 'diagnostics', label: 'Диагностика'}]
  const paymentFlows = flows.data?.items.filter(flow => Number(flow.amount) !== 0) || []
  const chartFlows = paymentFlows.slice(0, 24)
  const kvRow = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex justify-between gap-5 py-3 border-b border-border last:border-0 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <b className="font-semibold text-right tnum">{value}</b>
    </div>
  )
  return (
    <>
      <PageHeader
        crumb={`СДЕЛКА ${item.deal_id}`}
        title={`Сделка ${item.deal_id}`}
        description={`Портфель / ${portfolioId?.slice(0, 8)} / ${item.deal_id}`}
        actions={
          <>
            <Link to={`/portfolios/${portfolioId}`}><Button variant="secondary"><ArrowLeft size={15} /> К портфелю</Button></Link>
            <Link to={discountLink}><Button variant="primary" size="lg"><TrendingUp size={16} strokeWidth={2.2} /> Дисконтирование сделки</Button></Link>
          </>
        }
      />
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Badge tone={item.kind === 'credit' ? 'lime' : 'slate'}>{item.kind === 'credit' ? 'Кредит' : 'Депозит'}</Badge>
        <Badge tone="outline">{item.discriminator}</Badge>
        <Badge tone="outline">{item.rate_type}</Badge>
        <Badge tone={item.validation_status === 'valid' ? 'lime' : 'red'}>{item.validation_status}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KPI icon={Wallet} label="Текущий остаток" value={formatMoney(Math.abs(Number(item.principal)))} sub={item.kind === 'deposit' ? 'Знак в модели отрицательный' : 'Актив банка'} />
        <KPI icon={Percent} label="Ставка" value={formatPercentFromDecimal(item.interest_rate)} sub={item.rate_type === 'FLOAT' ? 'Маржа к CBKEY1M' : 'Фиксированная'} />
        <KPI icon={CalendarClock} label="Дата погашения" value={formatDate(item.maturity_date)} sub={`С даты ${formatDate(item.deal_date)}`} />
        <KPI accent icon={TrendingUp} label="NPV сделки" value={formatMoney(item.valuation?.npv)} sub={item.valuation ? `PV ${formatMoney(item.valuation.pv)}` : 'Нужен полный расчёт портфеля'} />
      </div>
      <Tabs items={tabs.map(entry => ({label: entry.label, to: `/portfolios/${portfolioId}/deals/${dealId}?tab=${entry.key}`, active: tab === entry.key}))} />
      {tab === 'payments' && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5">
            <Card>
              <CardHeader title="Динамика платежей" side={flows.data?.run_id ? `Запуск ${flows.data.run_id.slice(0, 8)}` : 'Нет запуска'} />
              {chartFlows.length ? (
                <>
                  <Chart
                    height={280}
                    option={{
                      legend: {show: true, top: 0, right: 0},
                      xAxis: {type: 'category', data: chartFlows.map(flow => formatDate(flow.payment_date).slice(0, 5))},
                      yAxis: [
                        {type: 'value', name: 'Платёж', axisLabel: {color: chartColors.axis, fontSize: 11}, splitLine: {lineStyle: {color: chartColors.grid, type: 'dashed'}}},
                        {type: 'value', name: 'Остаток', axisLabel: {color: chartColors.axis, fontSize: 11}, splitLine: {show: false}},
                      ],
                      series: [
                        roundedBarSeries('Платёж', chartFlows.map(flow => Math.abs(Number(flow.amount))), chartColors.lime),
                        {
                          ...limeAreaSeries('Остаток долга', chartFlows.map(flow => Math.abs(Number(flow.principal_after ?? 0)))),
                          yAxisIndex: 1,
                          lineStyle: {width: 2, color: chartColors.steel},
                          itemStyle: {color: chartColors.steel},
                          areaStyle: undefined,
                        },
                      ],
                    }}
                  />
                  <div className="flex items-center gap-2 text-[11px] text-faint mt-2">
                    <span className="w-2 h-2 rounded-full bg-lime inline-block" /> Сумма со знаком отображена по модулю; знак сохранён в таблице
                  </div>
                </>
              ) : (
                <EmptyState icon={ChartSpline} title="Денежные потоки не рассчитаны" text="Запустите реальный cfgen из карточки портфеля" />
              )}
            </Card>
            <Card>
              <CardHeader title="Параметры сделки" />
              {kvRow('ID сделки', item.deal_id)}
              {kvRow('Дата выдачи', formatDate(item.deal_date))}
              {kvRow('Дата погашения', formatDate(item.maturity_date))}
              {kvRow('Тип платежей', item.discriminator)}
              {kvRow('Ставка', item.rate_type)}
              {kvRow('Конвенция', item.raw_fields.day_convention_cd || '—')}
            </Card>
          </div>
          <Card>
            <CardHeader title="График платежей" side="Исходные события cfgen" />
            {paymentFlows.length ? (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-left whitespace-nowrap">
                  <thead>
                    <tr>{['Дата платежа', 'Тип события', 'Поток', 'Сумма со знаком', 'Остаток после'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {paymentFlows.slice(0, 100).map(flow => (
                      <tr key={flow.event_order} className="hover:bg-white/3 transition-colors">
                        <td className="border-b border-border px-3 py-2.5 text-[12px] tnum">{formatDate(flow.payment_date)}</td>
                        <td className="border-b border-border px-3 py-2.5 text-[12px]">{flow.payment_type}</td>
                        <td className="border-b border-border px-3 py-2.5 text-[12px] text-muted">{flow.stream}</td>
                        <td className="border-b border-border px-3 py-2.5 text-[12px] tnum">{formatMoney(flow.amount)}</td>
                        <td className="border-b border-border px-3 py-2.5 text-[12px] tnum text-muted">{formatMoney(flow.principal_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState compact title="Событий нет" text="Частичный или отсутствующий расчёт не подменяется примерными платежами" />
            )}
          </Card>
        </div>
      )}
      {tab === 'general' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Общие сведения" />
            {kvRow('Тип', item.kind === 'credit' ? 'Кредит' : 'Депозит')}
            {kvRow('График', item.discriminator)}
            {kvRow('Ставка', item.rate_type)}
            {kvRow('Остаток', formatMoney(item.principal))}
          </Card>
          <Card>
            <CardHeader title="Версионность" />
            <div className="rounded-panel bg-card2 border border-border p-4 flex gap-3">
              <Info size={17} className="text-lime shrink-0 mt-0.5" strokeWidth={1.8} />
              <div>
                <b className="text-xs">Исходная сделка неизменяема</b>
                <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Изменения условий создают сценарий или новую версию портфеля. Старые денежные потоки и NPV не перезаписываются.</p>
              </div>
            </div>
          </Card>
        </div>
      )}
      {tab === 'npv' && <DealValuation key={item.id} deal={item} discountLink={discountLink} />}
      {tab === 'raw' && (
        <Card>
          <CardHeader title="Исходные поля контракта nosnitches" side={`${Object.keys(item.raw_fields).length} полей`} />
          <div className="overflow-auto max-h-[520px]">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-card">
                <tr>{['Техническое поле', 'Исходное значение'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
              </thead>
              <tbody>
                {Object.entries(item.raw_fields).map(([key, value]) => (
                  <tr key={key} className="hover:bg-white/3 transition-colors">
                    <td className="border-b border-border px-3 py-2.5 text-[12px] text-muted font-mono">{key}</td>
                    <td className="border-b border-border px-3 py-2.5 text-[12px] font-mono">{value === '' ? <span className="text-faint">null / пусто</span> : value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'diagnostics' && <DealDiagnostics deal={item} runId={flows.data?.run_id} />}
    </>
  )
}

function DealValuation({deal, discountLink}: {deal: Deal; discountLink: string}) {
  const valuations = useValuations(deal.portfolio_id)
  const [page, setPage] = useState(1)
  const latest = valuations.data?.[0]
  const report = useDiscountBreakdown(latest?.run_id, page, undefined, 'base', deal.id)
  if (valuations.error || report.error) return <ErrorState message={(valuations.error || report.error)!.message} />
  if (valuations.isLoading || report.isLoading) return <LoadingState />
  if (!report.data) return <Card>
    <EmptyState icon={TrendingUp} title="Нужен полный расчёт NPV" text="Рассчитайте портфель с дисконтной кривой"
      action={<Link to={`/portfolios/${deal.portfolio_id}`} className="text-lime">Открыть портфель</Link>} />
  </Card>
  return <div className="flex flex-col gap-5">
    <Card>
      <CardHeader title="NPV и дисконтирование" side={<Link to={discountLink} className="text-lime">Сравнить кривые</Link>} />
      <p className="text-sm text-muted">PV {formatMoney(report.data.pv_before)} · NPV {formatMoney(report.data.npv_before)}</p>
    </Card>
    <DiscountDetail data={report.data} page={page} onPage={setPage} />
  </div>
}

function DealDiagnostics({deal, runId}: {deal: Deal; runId?: string}) {
  const issues = useQuery({
    queryKey: ['deal-issues', deal.id, runId],
    queryFn: () => api<{id: number; code: string; message: string; field?: string; severity: string}[]>(
      `/validation-issues?${new URLSearchParams({run_id: runId!, deal_id: deal.deal_id})}`,
    ),
    enabled: !!runId,
  })
  return <Card>
    <CardHeader title="Диагностика сделки" side={deal.validation_status} />
    {issues.error && <ErrorState message={issues.error.message} />}
    {issues.data?.length ? <ul className="pl-5 space-y-3 text-sm">{issues.data.map(issue => (
      <li key={issue.id} className="text-muted">{issue.severity} · {issue.code}{issue.field && ` · ${issue.field}`} · {issue.message}</li>
    ))}</ul> : !issues.isLoading && <EmptyState compact icon={CircleAlert} title={runId ? 'Замечаний по сделке нет' : 'Денежные потоки ещё не рассчитаны'}
      text={runId ? `Проверен запуск ${runId.slice(0, 8)}` : 'Запустите расчёт портфеля'} />}
  </Card>
}
