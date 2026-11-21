import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, formatDate, formatMoney } from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, SectionHeader, Select, Tabs } from '../components/ui'

type Run = {run_id: string; type: string; status: string; result?: Record<string, unknown>}
type Portfolio = {id: string; name: string; version: {valuation_date: string}; last_run?: Run}

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
  return <>
    <PageHeader crumb="ФАКТОРНЫЙ АНАЛИЗ NPV" title="Факторный анализ NPV" description={historical ? 'Сравнение экономической стоимости портфеля между двумя датами' : 'Моделирование изменений и объяснение влияния факторов на стоимость портфеля'} actions={historical ? <Button primary>Проверить доступность снимков</Button> : <Button primary disabled={!selectedRun || scenario.isPending} onClick={() => scenario.mutate()}>▶ {scenario.isPending ? 'Расчёт…' : 'Рассчитать'}</Button>} />
    <Tabs items={[{label: 'Сценарный анализ', to: '/analysis', active: !historical}, {label: 'Изменение между датами', to: '/analysis?mode=history', active: historical}]}/>
    {scenario.error && <ErrorState message={(scenario.error as Error).message}/>}
    {historical ? <Historical/> : <><div className="grid factor-grid"><Card><SectionHeader title="Настройки сценария" side={<Badge tone="blue">Что, если?</Badge>}/><Field label="Объект анализа"><Select value={selectedPortfolio} onChange={event => setPortfolioId(event.target.value)}><option value="">Нет портфеля</option>{portfolios.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Базовый расчёт"><Select value={selectedRun} onChange={event => setBaseRun(event.target.value)}><option value="">Нет полного NPV</option>{completeRuns.map(run => <option value={run.run_id} key={run.run_id}>{run.run_id.slice(0, 8)} · {formatMoney(String(run.result?.npv))}</option>)}</Select></Field><div className="divider"/><SectionHeader title="Изменяемые факторы"/><div className="factor-control"><div className="factor-h"><span>Сдвиг дисконтной кривой</span><span className="pill">{shift > 0 ? '+' : ''}{shift} б.п.</span></div><input className="scenario-range" type="range" min="-500" max="500" step="25" value={shift} onChange={event => setShift(Number(event.target.value))}/><div className="range-label"><span>−500 б.п.</span><span>+500 б.п.</span></div></div><Button>+ Добавить фактор</Button><div className="note"><b>Метод факторного разложения</b><p>Последовательная подстановка. CF не пересчитываются при изменении только DF; сумма вкладов равна итоговой ΔNPV.</p></div></Card><Card><SectionHeader title="Результаты сценария" side={<Badge>{result ? 'Реальный расчёт' : 'Нет результата'}</Badge>}/>{result ? <><div className="stat-3"><div><span>NPV до</span><b>{formatMoney(String(result.base_npv))}</b></div><div><span>NPV после</span><b>{formatMoney(String(result.scenario_npv))}</b></div><div><span>ΔNPV</span><b className={Number(result.delta_npv) < 0 ? 'neg' : ''}>{formatMoney(String(result.delta_npv))}</b></div></div><SectionHeader title="Разложение изменения NPV" side="Суммы в ₽"/><Waterfall result={result}/></> : <EmptyState title="Сценарий ещё не рассчитан" text={selectedRun ? 'Задайте фактор и нажмите «Рассчитать»' : 'Сначала выполните полный базовый NPV с денежными потоками и кривой'} icon="▥"/>}</Card></div><Card><SectionHeader title="Детализация факторов" side="Последовательный порядок"/>{Array.isArray(result?.waterfall) ? <table className="data-table"><thead><tr><th>Фактор</th><th>NPV до шага</th><th>NPV после шага</th><th>Вклад в ΔNPV</th><th>Метод</th></tr></thead><tbody>{(result.waterfall as Record<string,string>[]).map((row, index) => <tr key={index}><td>{row.factor}</td><td>{formatMoney(row.npv_before)}</td><td>{formatMoney(row.npv_after)}</td><td>{formatMoney(row.contribution)}</td><td>Пересчёт DF · CF неизменны</td></tr>)}</tbody></table> : <EmptyState title="Нет шагов" text="Вклады появятся после расчёта" big={false}/>}</Card></>}
  </>
}

function Waterfall({result}: {result: Record<string, unknown>}) {
  const base = Number(result.base_npv), scenario = Number(result.scenario_npv), delta = Number(result.delta_npv)
  const max = Math.max(Math.abs(base), Math.abs(scenario), Math.abs(delta), 1)
  return <div className="waterfall-css"><div className="wf-column"><span>{formatMoney(String(base))}</span><i style={{height: `${45 + Math.abs(base) / max * 100}px`}}/><b>NPV до</b></div><div className={`wf-column contribution ${delta < 0 ? 'down' : 'up'}`}><span>{formatMoney(String(delta))}</span><i style={{height: `${Math.max(12, Math.abs(delta) / max * 100)}px`}}/><b>Сдвиг DF</b></div><div className="wf-column"><span>{formatMoney(String(scenario))}</span><i style={{height: `${45 + Math.abs(scenario) / max * 100}px`}}/><b>NPV после</b></div></div>
}

function Historical() {
  return <><Card><SectionHeader title="Параметры исторического анализа"/><div className="form-grid four"><Field label="Портфель"><Select><option>Текущий портфель</option></Select></Field><Field label="Первая дата"><Input type="date"/></Field><Field label="Вторая дата"><Input type="date"/></Field><Field label="Метод сравнения"><Select><option>Последовательное разложение</option></Select></Field></div></Card><div className="callout"><span className="alert-icon">ⓘ</span><div><strong>Для анализа требуются два полных исторических снимка</strong><p>Нужны составы сделок, остатки, денежные потоки и кривые на обе даты. Сценарий текущего портфеля не выдаётся за исторический факт.</p></div><Badge tone="purple">Ожидает данных</Badge></div><div className="grid half-grid"><Card><SectionHeader title="Сравнение NPV"/><EmptyState title="Нет сопоставимых расчётов" text="Загрузите снимки на обе даты" icon="▥"/></Card><Card><SectionHeader title="Факторы изменения"/><EmptyState title="Вклад факторов пока недоступен" text="Появится после расчёта обеих дат" icon="◫"/></Card></div><Card><SectionHeader title="Необходимые данные"/><table className="data-table"><thead><tr><th>Источник</th><th>Первая дата</th><th>Вторая дата</th><th>Действие</th></tr></thead><tbody>{['Снимок портфеля', 'Кривая дисконтирования', 'Денежные потоки'].map(item => <tr key={item}><td>{item}</td><td><Badge tone="purple">Нет данных</Badge></td><td><Badge tone="purple">Нет данных</Badge></td><td>Открыть источники</td></tr>)}</tbody></table></Card></>
}
