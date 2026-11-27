import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ChartSpline, Info, Play, TrendingUp } from 'lucide-react'
import { api, formatDate, formatMoney } from '../lib/api'
import { runActive, useTrackedRun, useValuations, type IndicatorDataset, type Run } from '../lib/calculations'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, SectionHeader, Select, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { chartColors } from '../components/charts/chartTheme'
import { cn } from '../lib/utils'

type Portfolio = {id: string; name: string; version: {id?: string; valuation_date: string}; last_run?: Run}

function WaterfallChart({result}: {result: Record<string, unknown>}) {
  const rows = Array.isArray(result.waterfall) ? (result.waterfall as Record<string, string>[]) : []
  const categories = ['NPV до', ...rows.map(row => row.factor), 'NPV после']
  const base = Number(result.base_npv)
  const after = Number(result.scenario_npv)
  const totals = [base, ...rows.map(row => Number(row.npv_after))]
  const helper: number[] = [0]
  const values: ({value: number; itemStyle: {color: string}} | null)[] = [{value: base, itemStyle: {color: chartColors.total}}]
  rows.forEach(row => {
    const contribution = Number(row.contribution)
    const before = Number(row.npv_before)
    helper.push(contribution >= 0 ? before : before + contribution)
    values.push({value: Math.abs(contribution), itemStyle: {color: contribution >= 0 ? chartColors.lime : chartColors.red}})
  })
  helper.push(0)
  values.push({value: after, itemStyle: {color: chartColors.total}})
  return (
    <Chart
      height={300}
      option={{
        grid: {left: 8, right: 12, top: 24, bottom: 4, containLabel: true},
        xAxis: {type: 'category', data: categories, axisLabel: {color: chartColors.axis, fontSize: 11, interval: 0, rotate: categories.length > 5 ? 25 : 0}},
        yAxis: {type: 'value', axisLabel: {color: chartColors.axis, fontSize: 11, formatter: (value: number) => `${(value / 1_000_000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} млн`}, splitLine: {lineStyle: {color: chartColors.grid, type: 'dashed'}}},
        tooltip: {
          trigger: 'axis',
          formatter: params => {
            const items = params as {dataIndex: number}[]
            const index = items[0].dataIndex
            if (index === 0) return `NPV до<br/><b>${formatMoney(base)}</b>`
            if (index === categories.length - 1) return `NPV после<br/><b>${formatMoney(after)}</b>`
            const row = rows[index - 1]
            return `${row.factor}<br/>Вклад: <b>${formatMoney(row.contribution)}</b><br/>NPV после шага: ${formatMoney(row.npv_after)}`
          },
        },
        series: [
          {name: 'base', type: 'bar', stack: 'wf', data: helper, itemStyle: {color: 'transparent'}, emphasis: {itemStyle: {color: 'transparent'}}, tooltip: {show: false}, barMaxWidth: 46},
          {name: 'ΔNPV', type: 'bar', stack: 'wf', data: values, barMaxWidth: 46, itemStyle: {borderRadius: [6, 6, 0, 0]}},
        ],
      }}
    />
  )
}

export function AnalysisPage() {
  const [params] = useSearchParams()
  const historical = params.get('mode') === 'history'
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<Portfolio[]>('/portfolios')})
  const [portfolioId, setPortfolioId] = useState('')
  const [baseRun, setBaseRun] = useState('')
  const [shift, setShift] = useState(100)
  const [mode, setMode] = useState('market')
  const [discountScenario, setDiscountScenario] = useState('')
  const [indicatorScenario, setIndicatorScenario] = useState('')
  const selectedPortfolio = portfolioId || params.get('portfolio') || portfolios.data?.[0]?.id || ''
  const portfolio = useQuery({
    queryKey: ['portfolio', selectedPortfolio],
    queryFn: () => api<{runs: Run[]}>(`/portfolios/${selectedPortfolio}`),
    enabled: !!selectedPortfolio && !historical,
  })
  const completeRuns = portfolio.data?.runs.filter(run => run.type === 'valuation' && run.status === 'succeeded' && run.result?.npv != null) ?? []
  const base = completeRuns.find(run => run.run_id === baseRun) ?? completeRuns[0]
  const forecastId = base?.inputs?.forecast_id
  const snapshotId = base?.market_snapshot_id
  const curves = useQuery({queryKey: ['curves'], queryFn: () => api<{id: string; scenarios: string[]}[]>('/curves'), enabled: !historical})
  const forecasts = useQuery({queryKey: ['indicator-forecasts'], queryFn: () => api<IndicatorDataset[]>('/data/key-rate-forecasts'), enabled: !historical})
  const discountOptions = curves.data?.find(item => item.id === snapshotId)?.scenarios.filter(code => code !== 'base') ?? []
  const indicatorOptions = forecasts.data?.find(item => item.id === forecastId)?.scenarios.filter(code => code !== 'base') ?? []
  const selectedDiscount = discountOptions.includes(discountScenario) ? discountScenario : ''
  const selectedIndicator = indicatorOptions.includes(indicatorScenario) ? indicatorScenario : ''
  const scenario = useMutation({
    mutationFn: () => mode === 'market'
      ? api<Run>('/analysis/market-scenario', {method: 'POST', body: JSON.stringify({
        base_run_id: base?.run_id, discount_scenario: selectedDiscount || null, indicator_scenario: selectedIndicator || null,
      })})
      : api<Run>('/analysis/scenario', {method: 'POST', body: JSON.stringify({
        portfolio_id: selectedPortfolio, base_run_id: base?.run_id,
        name: `Сдвиг кривой ${shift} б.п.`, factors: [{kind: 'discount_shift_bp', value: String(shift)}],
      })}),
  })
  const tracked = useTrackedRun(scenario.data)
  const result = tracked.run?.status === 'succeeded' ? tracked.run.result : undefined
  const isPending = scenario.isPending || (runActive(tracked.run) && !tracked.error)
  const scenarioError = scenario.error?.message || tracked.error?.message || tracked.run?.error_summary
    || (typeof tracked.run?.result?.valuation_reason === 'string' ? tracked.run.result.valuation_reason : undefined)

  function resetScenario() {
    setDiscountScenario('')
    setIndicatorScenario('')
    scenario.reset()
  }
  return (
    <>
      <PageHeader
        crumb="ФАКТОРНЫЙ АНАЛИЗ NPV"
        title="Факторный анализ NPV"
        description={historical ? 'Сравнение экономической стоимости портфеля между двумя датами' : 'Моделирование изменений и объяснение влияния факторов на стоимость портфеля'}
        actions={!historical && <Button variant="primary" size="lg" disabled={!base || isPending || (mode === 'market' && !selectedDiscount && !selectedIndicator)} onClick={() => scenario.mutate()}><Play size={15} strokeWidth={2.4} /> {isPending ? 'Расчёт…' : 'Рассчитать'}</Button>}
      />
      <Tabs items={[{label: 'Сценарный', to: '/analysis', active: !historical}, {label: 'Исторический', to: '/analysis?mode=history', active: historical}]} />
      {scenarioError && <div className="mb-5"><ErrorState message={scenarioError} /></div>}
      {historical ? <Historical /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 xl:grid-cols-[0.75fr_1.25fr] gap-5">
            <Card>
              <CardHeader title="Факторы сценария" side={<Badge tone="outline">Что, если?</Badge>} />
              <Field label="Объект анализа" className="mb-4">
                <Select aria-label="Объект анализа" value={selectedPortfolio} onChange={event => {
                  setPortfolioId(event.target.value)
                  setBaseRun('')
                  resetScenario()
                }}>
                  <option value="">Нет портфеля</option>
                  {portfolios.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Базовый расчёт" className="mb-4">
                <Select aria-label="Базовый расчёт" value={base?.run_id ?? ''} onChange={event => {
                  setBaseRun(event.target.value)
                  resetScenario()
                }}>
                  <option value="">Нет полного NPV</option>
                  {completeRuns.map(run => <option value={run.run_id} key={run.run_id}>{run.run_id.slice(0, 8)} · {formatMoney(String(run.result?.npv))}{run.inputs?.forecast_id ? ' · с прогнозом CBKEY1M' : ''}</option>)}
                </Select>
              </Field>
              <div className="border-t border-border my-5" />
              <SectionHeader title="Изменяемые факторы" />
              <Field label="Режим сценария" className="mb-4">
                <Select aria-label="Режим сценария" value={mode} onChange={event => {
                  setMode(event.target.value)
                  resetScenario()
                }}>
                  <option value="market">Сохранённые рыночные сценарии</option>
                  <option value="manual">Ручной сдвиг дисконтной кривой</option>
                </Select>
              </Field>
              {mode === 'market' ? (
                <>
                  <Field label="Стресс кривой MOEX" className="mb-4">
                    <Select aria-label="Стресс кривой MOEX" value={selectedDiscount} onChange={event => setDiscountScenario(event.target.value)}>
                      <option value="">{discountOptions.length ? 'Базовая кривая' : 'Для снимка нет сохранённых стрессов'}</option>
                      {discountOptions.map(code => <option key={code} value={code}>{code}</option>)}
                    </Select>
                  </Field>
                  <Field label="Стресс прогноза CBKEY1M">
                    <Select aria-label="Стресс прогноза CBKEY1M" value={selectedIndicator} onChange={event => setIndicatorScenario(event.target.value)}>
                      <option value="">{indicatorOptions.length ? 'Базовый прогноз' : 'Для базового прогона нет стрессов прогноза'}</option>
                      {indicatorOptions.map(code => <option key={code} value={code}>{code}</option>)}
                    </Select>
                  </Field>
                </>
              ) : <div className="rounded-panel bg-card2 border border-border p-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">Сдвиг дисконтной кривой</span>
                  <Badge tone="lime">{shift > 0 ? '+' : ''}{shift} б.п.</Badge>
                </div>
                <input
                  type="range"
                  aria-label="Сдвиг дисконтной кривой"
                  min={-500}
                  max={500}
                  step={25}
                  value={shift}
                  className="lime-range"
                  style={{'--fill': `${((shift + 500) / 1000) * 100}%`} as React.CSSProperties}
                  onChange={event => setShift(Number(event.target.value))}
                />
                <div className="flex justify-between text-[10px] text-faint"><span>−500 б.п.</span><span>+500 б.п.</span></div>
              </div>}
              <div className="rounded-panel bg-card2 border border-border p-3.5 mt-5 flex gap-3">
                <Info size={16} className="text-lime shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <b className="text-xs">Метод факторного разложения</b>
                  <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Последовательная подстановка. CF не пересчитываются при изменении только DF; сумма вкладов равна итоговой ΔNPV.</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Результаты сценария" side={<Badge tone={result ? 'lime' : 'slate'}>{result ? 'Реальный расчёт' : 'Нет результата'}</Badge>} />
              {result ? (
                <>
                  <div className="grid grid-cols-3 gap-2.5 mb-5 max-md:grid-cols-1">
                    {[{label: 'NPV до', value: formatMoney(String(result.base_npv)), negative: false}, {label: 'NPV после', value: formatMoney(String(result.scenario_npv)), negative: false}, {label: 'ΔNPV', value: formatMoney(String(result.delta_npv)), negative: Number(result.delta_npv) < 0}].map(stat => (
                      <div key={stat.label} className="rounded-xl bg-card2 border border-border px-3.5 py-3.5 flex flex-col gap-1.5">
                        <span className="text-[10.5px] text-faint">{stat.label}</span>
                        <b className={cn('text-[17px] tnum', stat.negative && 'text-red')}>{stat.value}</b>
                      </div>
                    ))}
                  </div>
                  <SectionHeader title="Разложение изменения NPV" side="Суммы в ₽" />
                  <WaterfallChart result={result} />
                </>
              ) : (
                <EmptyState icon={TrendingUp} title={isPending ? 'Сценарий рассчитывается' : 'Сценарий ещё не рассчитан'} text={base ? 'Выберите факторы для расчёта' : 'Сначала выполните полный базовый NPV с денежными потоками и кривой'} />
              )}
            </Card>
          </div>
          <Card>
            <CardHeader title="Детализация факторов" side="Последовательный порядок" />
            {Array.isArray(result?.waterfall) ? (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>{['Фактор', 'NPV до шага', 'NPV после шага', 'Вклад в ΔNPV', 'Метод'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
                </thead>
                <tbody>
                  {(result.waterfall as Record<string, string>[]).map((row, index) => (
                    <tr key={index} className="hover:bg-white/3 transition-colors">
                      <td className="border-b border-border px-3 py-3 text-[12.5px]">{row.factor}</td>
                      <td className="border-b border-border px-3 py-3 text-[12.5px] tnum">{formatMoney(row.npv_before)}</td>
                      <td className="border-b border-border px-3 py-3 text-[12.5px] tnum">{formatMoney(row.npv_after)}</td>
                      <td className={cn('border-b border-border px-3 py-3 text-[12.5px] tnum font-semibold', Number(row.contribution) < 0 ? 'text-red' : 'text-lime')}>{formatMoney(row.contribution)}</td>
                      <td className="border-b border-border px-3 py-3 text-[12px] text-muted">{row.factor.startsWith('Прогноз CBKEY1M') ? 'Пересчёт CF и PV' : 'Пересчёт DF · CF неизменны'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState compact title="Нет шагов" text="Вклады появятся после расчёта" />
            )}
          </Card>
        </div>
      )}
    </>
  )
}


type HistoricalComparison = {
  first: {date: string; npv: string; pv: string; balance: string}
  last: {date: string; npv: string; pv: string; balance: string}
  delta: {npv: string; pv: string; balance: string}
}

function Historical() {
  const saved = useValuations()
  const [firstId, setFirst] = useState('')
  const [lastId, setLast] = useState('')
  const last = saved.data?.find(item => item.run_id === lastId) || saved.data?.[0]
  const earlier = saved.data?.filter(item => last && item.valuation_date < last.valuation_date) || []
  const first = earlier.find(item => item.run_id === firstId) || earlier[0]
  const comparison = useMutation({
    mutationFn: () => api<HistoricalComparison>('/analysis/historical', {
      method: 'POST', body: JSON.stringify({first_run_id: first?.run_id, last_run_id: last?.run_id}),
    }),
  })
  const result = comparison.data
  const metrics = [{key: 'npv', label: 'NPV'}, {key: 'pv', label: 'PV'}, {key: 'balance', label: 'Баланс со знаком'}] as const
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Сохранённые оценки на две даты" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Первый расчёт">
            <Select aria-label="Первый исторический расчёт" value={first?.run_id || ''} onChange={event => {setFirst(event.target.value); comparison.reset()}}>
              <option value="" disabled>Нет более раннего расчёта</option>
              {earlier.map(item => <option key={item.run_id} value={item.run_id}>{formatDate(item.valuation_date)} · {item.portfolio_name} · {item.run_id.slice(0, 8)}</option>)}
            </Select>
          </Field>
          <Field label="Второй расчёт">
            <Select aria-label="Второй исторический расчёт" value={last?.run_id || ''} onChange={event => {setLast(event.target.value); comparison.reset()}}>
              <option value="" disabled>Нет расчёта</option>
              {saved.data?.map(item => <option key={item.run_id} value={item.run_id}>{formatDate(item.valuation_date)} · {item.portfolio_name} · {item.run_id.slice(0, 8)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Button variant="primary" disabled={!first || !last || comparison.isPending} onClick={() => comparison.mutate()}>Сравнить сохранённые расчёты</Button>
        </div>
      </Card>
      {(saved.error || comparison.error) && <ErrorState message={(saved.error || comparison.error)!.message} />}
      {result ? <Card>
        <CardHeader title="Сравнение NPV" />
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr>{['Показатель', formatDate(result.first.date), formatDate(result.last.date), 'Изменение'].map(label => <th key={label} className="p-3 border-b border-border">{label}</th>)}</tr></thead>
          <tbody>{metrics.map(({key, label}) => <tr key={key} className="border-b border-border">
            <th className="p-3">{label}</th>
            <td className="p-3 tnum">{formatMoney(result.first[key])}</td>
            <td className="p-3 tnum">{formatMoney(result.last[key])}</td>
            <td className="p-3 tnum">{formatMoney(result.delta[key])}</td>
          </tr>)}</tbody>
        </table>
        <p className="text-muted text-xs mb-0">Разница NPV равна изменению PV за вычетом изменения баланса. Для атрибуции по времени, ставкам и составу нужны согласованная методика и исторические данные по сделкам.</p>
      </Card> : !saved.isLoading && <Card>
        <EmptyState icon={ChartSpline} title={first ? 'Сравнение готово к запуску' : 'Нужны полные расчёты на две даты'}
          text={first ? 'Выберите две сохранённые оценки и сравните значения' : 'Рассчитайте портфели с кривыми на разные даты'}
          action={!first && <Link className="text-lime" to="/portfolios">Открыть портфели</Link>} />
      </Card>}
    </div>
  )
}
