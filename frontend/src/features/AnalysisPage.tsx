import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChartSpline, Info, Play, Plus, TrendingUp } from 'lucide-react'
import { api, formatDate, formatMoney } from '../lib/api'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, SectionHeader, Select, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { chartColors } from '../components/charts/chartTheme'
import { cn } from '../lib/utils'

type Run = {run_id: string; type: string; status: string; result?: Record<string, unknown>}
type Portfolio = {id: string; name: string; version: {valuation_date: string}; last_run?: Run}

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
  const runs = useQuery({queryKey: ['runs'], queryFn: () => api<Run[]>('/runs')})
  const [portfolioId, setPortfolioId] = useState('')
  const [baseRun, setBaseRun] = useState('')
  const [shift, setShift] = useState(100)
  const completeRuns = useMemo(() => runs.data?.filter(run => run.type === 'valuation' && run.result?.npv) || [], [runs.data])
  const selectedPortfolio = portfolioId || portfolios.data?.[0]?.id || ''
  const selectedRun = baseRun || completeRuns[0]?.run_id || ''
  const scenario = useMutation({mutationFn: () => api<Run>('/analysis/scenario', {method: 'POST', body: JSON.stringify({portfolio_id: selectedPortfolio, base_run_id: selectedRun, name: `Сдвиг кривой ${shift} б.п.`, factors: [{kind: 'discount_shift_bp', value: String(shift)}]})})})
  const result = scenario.data?.result
  return (
    <>
      <PageHeader
        crumb="ФАКТОРНЫЙ АНАЛИЗ NPV"
        title="Факторный анализ NPV"
        description={historical ? 'Сравнение экономической стоимости портфеля между двумя датами' : 'Моделирование изменений и объяснение влияния факторов на стоимость портфеля'}
        actions={historical
          ? <Button variant="primary" size="lg">Проверить доступность снимков</Button>
          : <Button variant="primary" size="lg" disabled={!selectedRun || scenario.isPending} onClick={() => scenario.mutate()}><Play size={15} strokeWidth={2.4} /> {scenario.isPending ? 'Расчёт…' : 'Рассчитать'}</Button>}
      />
      <Tabs items={[{label: 'Сценарный', to: '/analysis', active: !historical}, {label: 'Исторический', to: '/analysis?mode=history', active: historical}]} />
      {scenario.error && <div className="mb-5"><ErrorState message={(scenario.error as Error).message} /></div>}
      {historical ? <Historical /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 xl:grid-cols-[0.75fr_1.25fr] gap-5">
            <Card>
              <CardHeader title="Факторы сценария" side={<Badge tone="outline">Что, если?</Badge>} />
              <Field label="Объект анализа" className="mb-4">
                <Select value={selectedPortfolio} onChange={event => setPortfolioId(event.target.value)}>
                  <option value="">Нет портфеля</option>
                  {portfolios.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Базовый расчёт" className="mb-4">
                <Select value={selectedRun} onChange={event => setBaseRun(event.target.value)}>
                  <option value="">Нет полного NPV</option>
                  {completeRuns.map(run => <option value={run.run_id} key={run.run_id}>{run.run_id.slice(0, 8)} · {formatMoney(String(run.result?.npv))}</option>)}
                </Select>
              </Field>
              <div className="border-t border-border my-5" />
              <SectionHeader title="Изменяемые факторы" />
              <div className="rounded-panel bg-card2 border border-border p-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">Сдвиг дисконтной кривой</span>
                  <Badge tone="lime">{shift > 0 ? '+' : ''}{shift} б.п.</Badge>
                </div>
                <input
                  type="range"
                  min={-500}
                  max={500}
                  step={25}
                  value={shift}
                  className="lime-range"
                  style={{'--fill': `${((shift + 500) / 1000) * 100}%`} as React.CSSProperties}
                  onChange={event => setShift(Number(event.target.value))}
                />
                <div className="flex justify-between text-[10px] text-faint"><span>−500 б.п.</span><span>+500 б.п.</span></div>
              </div>
              <Button variant="secondary" className="mt-4"><Plus size={15} /> Добавить фактор</Button>
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
                <EmptyState icon={TrendingUp} title="Сценарий ещё не рассчитан" text={selectedRun ? 'Задайте фактор и нажмите «Рассчитать»' : 'Сначала выполните полный базовый NPV с денежными потоками и кривой'} />
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
                      <td className="border-b border-border px-3 py-3 text-[12px] text-muted">Пересчёт DF · CF неизменны</td>
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

function Historical() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Параметры исторического анализа" />
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field label="Портфель"><Select><option>Текущий портфель</option></Select></Field>
          <Field label="Первая дата"><Input type="date" /></Field>
          <Field label="Вторая дата"><Input type="date" /></Field>
          <Field label="Метод сравнения"><Select><option>Последовательное разложение</option></Select></Field>
        </div>
      </Card>
      <Card className="border-amber/25">
        <div className="flex items-start gap-4">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-amber/12 text-amber shrink-0"><Info size={22} strokeWidth={1.8} /></span>
          <div className="flex-1">
            <strong className="block text-[14px]">Для анализа требуются два полных исторических снимка</strong>
            <p className="text-muted text-xs leading-relaxed mt-1.5 mb-0">Нужны составы сделок, остатки, денежные потоки и кривые на обе даты. Сценарий текущего портфеля не выдаётся за исторический факт.</p>
          </div>
          <Badge tone="amber">Ожидает данных</Badge>
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Сравнение NPV" />
          <EmptyState icon={ChartSpline} title="Нет сопоставимых расчётов" text="Загрузите снимки на обе даты" />
        </Card>
        <Card>
          <CardHeader title="Факторы изменения" />
          <EmptyState title="Вклад факторов пока недоступен" text="Появится после расчёта обеих дат" />
        </Card>
      </div>
      <Card>
        <CardHeader title="Необходимые данные" />
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>{['Источник', 'Первая дата', 'Вторая дата', 'Действие'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {['Снимок портфеля', 'Кривая дисконтирования', 'Денежные потоки'].map(item => (
              <tr key={item} className="hover:bg-white/3 transition-colors">
                <td className="border-b border-border px-3 py-3 text-[12.5px]">{item}</td>
                <td className="border-b border-border px-3 py-3"><Badge tone="slate">Нет данных</Badge></td>
                <td className="border-b border-border px-3 py-3"><Badge tone="slate">Нет данных</Badge></td>
                <td className="border-b border-border px-3 py-3 text-[12px] text-lime">Открыть источники</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
