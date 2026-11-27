import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ChartSpline, Check, ChevronRight, Hash, Info, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { api, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { runActive, useTrackedRun, useValuations, type Run } from '../lib/calculations'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, KPI, LoadingState, PageHeader, Select, StatusBadge, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { DiscountDetail, useDiscountBreakdown } from '../components/DiscountDetail'
import { chartColors, limeAreaSeries } from '../components/charts/chartTheme'

type Snapshot = {id: string; source: string; external_id?: string; trade_date: string; retrieved_at: string; convention: string; data_hash: string; source_sha?: string; point_count: number; scenario: string; scenarios: string[]; curve_type: string}
type Curve = Snapshot & {points: {bucket_code: string; tenor_years: string; rate_decimal: string; rate_percent: string; shift_bp?: string}[]}

const tabs = [{key: 'curves', label: 'Кривые'}, {key: 'scenarios', label: 'Сценарии'}, {key: 'discount', label: 'Дисконтирование и NPV'}, {key: 'history', label: 'История кривых'}]

export function CurvesPage() {
  const [params, setParams] = useSearchParams()
  const [tradeDate, setTradeDate] = useState('')
  const tab = params.get('tab') || 'curves'
  const snapshots = useQuery({queryKey: ['curves'], queryFn: () => api<Snapshot[]>('/curves')})
  const snapshot = snapshots.data?.find(item => item.id === params.get('snapshot')) ?? snapshots.data?.[0]
  const selected = snapshot?.id
  const requestedScenario = params.get('scenario') || 'base'
  const scenario = snapshot?.scenarios.includes(requestedScenario) ? requestedScenario : 'base'
  const curve = useQuery({
    queryKey: ['curve', selected, scenario],
    queryFn: () => api<Curve>(`/curves/${selected}?scenario=${encodeURIComponent(scenario)}`),
    enabled: !!selected && tab === 'curves',
  })
  const queryClient = useQueryClient()
  const refresh = useMutation({
    mutationFn: () => api<Snapshot>('/curves/refresh', {method: 'POST'}),
    onSuccess: snapshot => {
      void queryClient.invalidateQueries({queryKey: ['curves']})
      setParams(previous => {
        const next = new URLSearchParams(previous)
        next.set('snapshot', snapshot.id)
        next.delete('scenario')
        return next
      })
    },
  })
  const calculate = useMutation({
    mutationFn: () => api<Run>('/curves/calculate', {
      method: 'POST', body: JSON.stringify({trade_date: tradeDate || null}),
    }),
  })
  const tracked = useTrackedRun(calculate.data)
  const calculatedId = tracked.run?.status === 'succeeded' ? tracked.run.result?.snapshot_id : undefined
  const displayedSnapshot = useRef<string>(undefined)
  useEffect(() => {
    if (typeof calculatedId !== 'string' || displayedSnapshot.current === calculatedId) return
    displayedSnapshot.current = calculatedId
    void queryClient.invalidateQueries({queryKey: ['curves']})
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('snapshot', calculatedId)
      next.delete('scenario')
      return next
    })
  }, [calculatedId, queryClient, setParams])

  function selectCurve(snapshotId: string, code = 'base') {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('snapshot', snapshotId)
      next.set('scenario', code)
      return next
    })
  }

  const pending = calculate.isPending || (runActive(tracked.run) && !tracked.error)
  const error = calculate.error?.message || tracked.error?.message || tracked.run?.error_summary
    || refresh.error?.message || snapshots.error?.message || curve.error?.message
  if (snapshots.isLoading) return <LoadingState />
  return (
    <>
      <PageHeader
        crumb="КРИВЫЕ СТАВОК"
        title="Кривые ставок"
        description={tab === 'scenarios' ? 'Стресс-сценарии, рассчитанные QuantumTeam для выбранного снимка' : tab === 'discount' ? 'Влияние базовой и сценарной дисконтных кривых на PV и NPV' : tab === 'history' ? 'Сравнение рыночных кривых за разные даты' : 'Базовые и сценарные процентные кривые, сравнение по срокам'}
        actions={(
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" disabled={refresh.isPending || pending} onClick={() => {calculate.reset(); refresh.mutate()}}>Импортировать готовый</Button>
            <Input type="date" aria-label="Торговая дата MOEX" value={tradeDate} onChange={event => setTradeDate(event.target.value)} className="w-auto" />
            <Button variant="primary" disabled={pending || refresh.isPending} onClick={() => {refresh.reset(); calculate.mutate()}}>
              <RefreshCw size={15} strokeWidth={2.2} /> {pending ? 'Построение…' : 'Построить кривую MOEX'}
            </Button>
          </div>
        )}
      />
      <Tabs items={tabs.map(item => {
        const search = new URLSearchParams(params)
        if (item.key === 'curves') search.delete('tab')
        else search.set('tab', item.key)
        return {label: item.label, to: `/curves?${search}`, active: item.key === tab}
      })} />
      {error && <div className="mb-5"><ErrorState message={error} /></div>}
      {tracked.run && <div className="mb-4"><StatusBadge status={tracked.run.status} /></div>}
      {snapshot && (tab === 'curves' || tab === 'scenarios') && (
        <div className="grid gap-3 sm:grid-cols-2 mb-5 max-w-[640px]">
          <Field label="Сохранённый снимок">
            <Select aria-label="Сохранённый снимок" value={selected} onChange={event => selectCurve(event.target.value)}>
              {snapshots.data?.map(item => <option key={item.id} value={item.id}>{item.trade_date} · {item.source} · {item.id.slice(0, 8)}</option>)}
            </Select>
          </Field>
          {tab === 'curves' && <Field label="Сценарий снимка">
            <Select aria-label="Сценарий снимка" value={scenario} onChange={event => selectCurve(snapshot.id, event.target.value)}>
              {snapshot.scenarios.map(code => <option key={code} value={code}>{code === 'base' ? 'Базовая кривая' : code}</option>)}
            </Select>
          </Field>}
        </div>
      )}
      {tab === 'curves' && (curve.isLoading ? <LoadingState /> : <Curves curve={curve.data} />)}
      {tab === 'scenarios' && <Scenarios snapshot={snapshot} />}
      {tab === 'discount' && <Discount snapshots={snapshots.data || []} />}
      {tab === 'history' && <History snapshots={snapshots.data || []} />}
    </>
  )
}

function Curves({curve}: {curve?: Curve}) {
  if (!curve) {
    return (
      <Card>
        <EmptyState icon={ChartSpline} title="Нет сохранённых снимков кривой" text="Получите реальный снимок QuantumTeam или импортируйте проверенный набор с указанием источника" />
        <div className="rounded-panel bg-card2 border border-border p-3.5 max-w-[560px] mx-auto">
          <b className="text-xs">Данные не генерируются автоматически</b>
          <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Случайные ставки не используются как рыночные. Учебный эталон можно импортировать только с отдельной маркировкой.</p>
        </div>
      </Card>
    )
  }
  const points = curve.points
  const middle = points[Math.floor(points.length / 2)]
  const kvRow = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex justify-between gap-5 py-3 border-b border-border last:border-0 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <b className="font-semibold text-right tnum">{value}</b>
    </div>
  )
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-[11.5px] text-muted">Источник <strong className="text-foreground">{curve.source}</strong></span>
        <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-[11.5px] text-muted">Снимок <strong className="text-foreground">{formatDate(curve.trade_date)}</strong></span>
        <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-[11.5px] text-muted">Точек <strong className="text-foreground">{curve.point_count}</strong></span>
        <StatusBadge status={curve.source === 'quantum_cached' ? 'Сохранённый снимок' : 'Доступно'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI icon={TrendingUp} label="Краткая ставка" value={points[0] ? formatPercentFromDecimal(points[0].rate_decimal) : '—'} sub={points[0]?.bucket_code || 'Нет точки'} />
        <KPI icon={TrendingUp} label="Средний срок" value={middle ? formatPercentFromDecimal(middle.rate_decimal) : '—'} sub={middle?.bucket_code || 'Нет точки'} />
        <KPI icon={TrendingUp} label="Длинная ставка" value={points.at(-1) ? formatPercentFromDecimal(points.at(-1)!.rate_decimal) : '—'} sub={points.at(-1)?.bucket_code || 'Нет точки'} />
        <KPI accent icon={Check} label="Источник" value={<span className="text-[19px]">{curve.source}</span>} sub={curve.source_sha ? `SHA ${curve.source_sha.slice(0, 8)}` : 'Версия указана в метаданных'} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5">
        <Card>
          <CardHeader title="Кривая по срокам" side={<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime inline-block" /> {curve.scenario === 'base' ? 'Базовая' : curve.scenario}</span>} />
          <Chart
            height={300}
            option={{
              xAxis: {type: 'category', data: points.map(point => point.bucket_code)},
              yAxis: {type: 'value', axisLabel: {color: chartColors.axis, fontSize: 11, formatter: (value: number) => `${value}%`}, splitLine: {lineStyle: {color: chartColors.grid, type: 'dashed'}}},
              tooltip: {trigger: 'axis', valueFormatter: value => `${Number(value).toLocaleString('ru-RU', {maximumFractionDigits: 2})}%`},
              series: [{...limeAreaSeries(curve.scenario === 'base' ? 'Базовая кривая' : curve.scenario, points.map(point => Number(point.rate_decimal) * 100)), showSymbol: true}],
            }}
          />
        </Card>
        <Card>
          <CardHeader title="Кривая как источник" />
          {kvRow('Источник', curve.source)}
          {kvRow('Дата торгов', formatDate(curve.trade_date))}
          {kvRow('Получено', new Date(curve.retrieved_at).toLocaleString('ru-RU'))}
          {kvRow('Конвенция', curve.convention)}
          <div className="rounded-panel bg-card2 border border-border p-3.5 mt-4 flex gap-3">
            <Info size={16} className="text-amber shrink-0 mt-0.5" strokeWidth={1.8} />
            <div>
              <b className="text-xs">Важное ограничение</b>
              <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Эта кривая задаёт дисконтирование платежей. Для FLOAT-прогноза загрузите отдельный CSV CBKEY1M.</p>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Точки кривой" side={<span className="font-mono text-[11px]">{curve.data_hash.slice(0, 12)}</span>} />
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>{['Точка', 'Срок, лет', 'Ставка', 'Источник', 'Статус'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {points.map(point => (
              <tr key={point.bucket_code} className="hover:bg-white/3 transition-colors">
                <td className="border-b border-border px-3 py-3 text-[12.5px] font-semibold">{point.bucket_code}</td>
                <td className="border-b border-border px-3 py-3 text-[12.5px] tnum text-muted">{point.tenor_years}</td>
                <td className="border-b border-border px-3 py-3 text-[12.5px] tnum text-lime font-semibold">{formatPercentFromDecimal(point.rate_decimal)}</td>
                <td className="border-b border-border px-3 py-3 text-[12px] text-muted">{curve.source}</td>
                <td className="border-b border-border px-3 py-3"><StatusBadge status="Доступно" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Scenarios({snapshot}: {snapshot?: Snapshot}) {
  const codes = snapshot?.scenarios.filter(code => code !== 'base') ?? []
  return (
    <Card>
      <CardHeader title="Стресс-сценарии снимка" />
      {snapshot && codes.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {codes.map(code => (
            <Link key={code} to={`/curves?snapshot=${snapshot.id}&scenario=${encodeURIComponent(code)}`}
              className="flex items-center gap-3 rounded-panel border border-border bg-card2 p-3.5 hover:border-lime/50">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/5 text-muted">
                {code.includes('down') ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
              </span>
              <strong className="flex-1 text-[12.5px]">{code}</strong>
              <ChevronRight size={17} className="text-faint" />
            </Link>
          ))}
        </div>
      ) : <EmptyState icon={ChartSpline} title="Стресс-сценариев пока нет" text="Постройте срочную кривую QuantumTeam или выберите снимок с рассчитанными сценариями" />}
    </Card>
  )
}


function Discount({snapshots}: {snapshots: Snapshot[]}) {
  const [params] = useSearchParams()
  const portfolioId = params.get('portfolio') || undefined
  const dealId = params.get('deal') || undefined
  const valuations = useValuations(portfolioId)
  const [runId, setRunId] = useState('')
  const [curveId, setCurveId] = useState('')
  const [scenarioCode, setScenarioCode] = useState('')
  const [page, setPage] = useState(1)
  const run = valuations.data?.find(item => item.run_id === runId) || valuations.data?.[0]
  const choices = snapshots.filter(item => run && item.trade_date <= run.valuation_date)
  const selected = choices.find(item => item.id === curveId) || choices.find(item => item.id === run?.snapshot_id)
  const scenario = selected?.scenarios.includes(scenarioCode) ? scenarioCode : 'base'
  const breakdown = useDiscountBreakdown(run?.run_id, page, selected?.id, scenario, dealId)
  const data = breakdown.data
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={dealId ? 'Дисконтирование сделки' : 'Параметры дисконтирования'} />
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field label="Базовый расчёт">
            <Select aria-label="Базовый расчёт для дисконтирования" value={run?.run_id || ''} onChange={event => {
              setRunId(event.target.value)
              setCurveId('')
              setScenarioCode('')
              setPage(1)
            }}>
              <option value="" disabled>Нет полного NPV</option>
              {valuations.data?.map(item => <option key={item.run_id} value={item.run_id}>{item.portfolio_name} · {formatDate(item.valuation_date)} · {item.run_id.slice(0, 8)}</option>)}
            </Select>
          </Field>
          <Field label="Кривая после">
            <Select aria-label="Кривая после" value={selected?.id || ''} onChange={event => {
              setCurveId(event.target.value)
              setScenarioCode('')
              setPage(1)
            }}>
              <option value="" disabled>Нет кривой</option>
              {choices.map(item => <option key={item.id} value={item.id}>{formatDate(item.trade_date)} · {item.source}</option>)}
            </Select>
          </Field>
          <Field label="Сценарий сравнения">
            <Select aria-label="Сценарий сравнения" value={scenario} onChange={event => {setScenarioCode(event.target.value); setPage(1)}}>
              {(selected?.scenarios || ['base']).map(code => <option key={code} value={code}>{code === 'base' ? 'Базовая кривая' : code}</option>)}
            </Select>
          </Field>
        </div>
        {run && <p className="text-muted text-xs mt-3 mb-0">Дата оценки {formatDate(run.valuation_date)} · базовая методика {run.method_version}</p>}
      </Card>
      {valuations.error && <ErrorState message={valuations.error.message} onRetry={() => {void valuations.refetch()}} />}
      {breakdown.error && <ErrorState message={breakdown.error.message} />}
      {breakdown.isLoading && <LoadingState />}
      {data && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KPI icon={Hash} label="NPV до" value={formatMoney(data.npv_before)} sub={`PV ${formatMoney(data.pv_before)}`} />
          <KPI icon={Hash} label="NPV после" value={formatMoney(data.npv_after)} sub={`PV ${formatMoney(data.pv_after)}`} />
          <KPI accent icon={TrendingUp} label="ΔNPV и ΔPV" value={formatMoney(data.delta)} sub="Остатки портфеля зафиксированы" />
        </div>
        <DiscountDetail data={data} page={page} onPage={setPage} />
      </>}
      {!run && !valuations.isLoading && <Card>
        <EmptyState icon={ChartSpline} title="Нужен полный расчёт NPV" text="Рассчитайте портфель с дисконтной кривой"
          action={<Link className="text-lime" to={portfolioId ? `/portfolios/${portfolioId}` : '/portfolios'}>Открыть портфель</Link>} />
      </Card>}
    </div>
  )
}

function History({snapshots}: {snapshots: Snapshot[]}) {
  const [firstId, selectFirst] = useState('')
  const [lastId, selectLast] = useState('')
  const comparable = snapshots.filter(item => item.curve_type === 'quantum_term')
  const available = comparable.length >= 2 ? comparable : snapshots
  const last = available.find(item => item.id === lastId) || available[0]
  const first = available.find(item => item.id === firstId)
    || available.find(item => last && item.trade_date < last.trade_date)
    || available.find(item => item.id !== last?.id)
  const firstCurve = useQuery({queryKey: ['curve', first?.id, 'base'], queryFn: () => api<Curve>(`/curves/${first?.id}`), enabled: !!first})
  const lastCurve = useQuery({queryKey: ['curve', last?.id, 'base'], queryFn: () => api<Curve>(`/curves/${last?.id}`), enabled: !!last})
  const error = firstCurve.error || lastCurve.error
  const ratesByTenor = new Map(lastCurve.data?.points.map(point => [Number(point.tenor_years), Number(point.rate_decimal)]))
  const diff = firstCurve.data?.points.flatMap(point => {
    const tenor = Number(point.tenor_years)
    const next = ratesByTenor.get(tenor)
    return next === undefined ? [] : [{tenor, bp: (next - Number(point.rate_decimal)) * 10_000}]
  }) || []
  const ready = firstCurve.data && lastCurve.data
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Историческое сравнение" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Начальная дата"><Select aria-label="Начальный снимок кривой" value={first?.id || ''} onChange={event => selectFirst(event.target.value)}>
            <option value="" disabled>Нет снимка</option>
            {available.filter(item => item.id !== last?.id).map(item => <option key={item.id} value={item.id}>{formatDate(item.trade_date)} · {item.id.slice(0, 8)}</option>)}
          </Select></Field>
          <Field label="Конечная дата"><Select aria-label="Конечный снимок кривой" value={last?.id || ''} onChange={event => selectLast(event.target.value)}>
            <option value="" disabled>Нет снимка</option>
            {available.filter(item => item.id !== first?.id).map(item => <option key={item.id} value={item.id}>{formatDate(item.trade_date)} · {item.id.slice(0, 8)}</option>)}
          </Select></Field>
        </div>
      </Card>
      {error && <ErrorState message={error.message} />}
      {(firstCurve.isLoading || lastCurve.isLoading) && <LoadingState />}
      {ready ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Кривые на две даты" />
            <Chart height={285} option={{
              legend: {show: true}, xAxis: {type: 'value', name: 'Лет'}, yAxis: {type: 'value', name: '% годовых'},
              series: [firstCurve.data!, lastCurve.data!].map(item => ({
                type: 'line', name: first?.trade_date === last?.trade_date ? `${formatDate(item.trade_date)} · ${item.id.slice(0, 8)}` : formatDate(item.trade_date), showSymbol: false,
                data: item.points.map(point => [Number(point.tenor_years), Number(point.rate_percent)]),
              })),
            }} />
          </Card>
          <Card>
            <CardHeader title="Изменения по срокам" side="б.п." />
            {diff.length ? <div className="max-h-[290px] overflow-auto"><table className="w-full text-left text-xs">
              <thead><tr><th className="p-2">Срок, лет</th><th className="p-2">Изменение</th></tr></thead>
              <tbody>{diff.map(item => <tr className="border-t border-border" key={item.tenor}><td className="p-2">{item.tenor}</td><td className="p-2">{item.bp.toFixed(2)}</td></tr>)}</tbody>
            </table></div> : <EmptyState title="Нет общих сроков" text="Выберите снимки с сопоставимыми узлами" />}
          </Card>
        </div>
      ) : !first && <Card><EmptyState icon={ChartSpline} title="Нужны два снимка" text="Укажите торговую дату и постройте ещё одну кривую MOEX" /></Card>}
    </div>
  )
}
