import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, formatCount } from '../lib/api'
import { Bar, Button, Card, ErrorState, Field, Input, PageHeader, SectionHeader, Select, Tabs } from '../components/ui'

type Generated = {status: string; error_summary?: string; result?: {portfolio_id: string; credit_count: number; deposit_count: number}}

export function GeneratorPage() {
  const [params] = useSearchParams()
  const advanced = params.get('mode') === 'advanced'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({name: 'Синтетический портфель', portfolio_type: 'mixed', count: 1000, valuation_date: new Date().toISOString().slice(0, 10), seed: 42, credit_share: 70, min_amount: 100000, max_amount: 5000000, min_term_months: 6, max_term_months: 60, min_rate_percent: 8, max_rate_percent: 24, fixed_share: 70, amount_distribution: 'lognormal'})
  const update = (field: string, value: string | number) => setForm(current => ({...current, [field]: value}))
  const generation = useMutation({mutationFn: async () => {
    let run = await api<Generated & {run_id: string}>('/portfolios/generate', {method: 'POST', body: JSON.stringify({...form, count: Number(form.count), seed: Number(form.seed), credit_share: Number(form.credit_share), min_amount: String(form.min_amount), max_amount: String(form.max_amount), min_term_months: Number(form.min_term_months), max_term_months: Number(form.max_term_months), min_rate_percent: String(form.min_rate_percent), max_rate_percent: String(form.max_rate_percent), fixed_share: Number(form.fixed_share)})})
    for (let attempt = 0; run.status === 'queued' || run.status === 'running'; attempt += 1) {
      if (attempt >= 120) throw new Error('Генерация продолжается в фоне. Откройте «Запуски расчётов».')
      await new Promise(resolve => window.setTimeout(resolve, 500))
      run = await api<Generated & {run_id: string}>(`/runs/${run.run_id}`)
    }
    return run
  }, onSuccess: async data => {await queryClient.invalidateQueries({queryKey: ['portfolios']}); if (data.result?.portfolio_id) navigate(`/portfolios/${data.result.portfolio_id}`)}})
  const split = useMemo(() => {const credit = form.portfolio_type === 'credit' ? 100 : form.portfolio_type === 'deposit' ? 0 : Number(form.credit_share); const creditCount = Math.round(Number(form.count) * credit / 100); return {credit, creditCount, deposits: Number(form.count) - creditCount}}, [form])
  return <>
    <PageHeader crumb="ГЕНЕРАТОР СДЕЛОК" title="Генератор сделок" description={advanced ? 'Детальная настройка распределений и условий кредитных и депозитных сделок' : 'Сформируйте синтетический портфель с контролируемой структурой'} actions={advanced ? <Button primary disabled={generation.isPending} onClick={() => generation.mutate()}>✦ Сгенерировать</Button> : <Link to="/integrations?tab=runs"><Button>История генераций</Button></Link>} />
    <Tabs items={[{label: 'Простой режим', to: '/generator', active: !advanced}, {label: 'Расширенный режим', to: '/generator?mode=advanced', active: advanced}]} />
    {generation.error && <ErrorState message={(generation.error as Error).message} />}
    {advanced ? <Advanced form={form} update={update} split={split} onGenerate={() => generation.mutate()} pending={generation.isPending} /> : <Simple form={form} update={update} split={split} onGenerate={() => generation.mutate()} pending={generation.isPending} />}
  </>
}

type FormState = Record<string, string | number>
type Split = {credit: number; creditCount: number; deposits: number}
type Props = {form: FormState; update: (field: string, value: string | number) => void; split: Split; onGenerate: () => void; pending: boolean}

function Simple({form, update, split, onGenerate, pending}: Props) {
  return <div className="grid generator-grid"><Card><SectionHeader title="Основные параметры"/><div className="form-grid">
    <Field label="Название портфеля"><Input value={form.name} onChange={e => update('name', e.target.value)}/></Field>
    <Field label="Количество сделок"><Input type="number" min="1" max="100000" value={form.count} onChange={e => update('count', Number(e.target.value))}/></Field>
    <Field label="Тип портфеля"><Select value={form.portfolio_type} onChange={e => update('portfolio_type', e.target.value)}><option value="mixed">Смешанный · кредиты и депозиты</option><option value="credit">Только кредиты</option><option value="deposit">Только депозиты</option></Select></Field>
    <Field label="Дата оценки"><Input type="date" value={form.valuation_date} onChange={e => update('valuation_date', e.target.value)}/></Field>
    <Field label="Модель сумм"><Select value={form.amount_distribution} onChange={e => update('amount_distribution', e.target.value)}><option value="lognormal">Логнормальная</option><option value="uniform">Равномерная</option><option value="normal">Нормальная</option></Select></Field>
    <Field label="Seed генератора"><Input type="number" value={form.seed} onChange={e => update('seed', Number(e.target.value))}/></Field>
  </div><div className="divider"/><SectionHeader title="Соотношение инструментов"/><label className="range-row"><span>Кредиты</span><strong>{split.credit}%</strong><input type="range" min="0" max="100" value={split.credit} disabled={form.portfolio_type !== 'mixed'} onChange={e => update('credit_share', Number(e.target.value))}/><span>Депозиты</span><strong>{100 - split.credit}%</strong></label><div className="footer-actions"><Button onClick={() => undefined}>Проверить настройки</Button><Button primary disabled={pending} onClick={onGenerate}>{pending ? 'Генерация…' : '✦ Сгенерировать портфель'}</Button></div></Card>
    <Card><SectionHeader title="Предварительная структура" side={<span className="badge blue">По настройкам</span>}/><div className="stat-3"><div><span>Сделок</span><b>{formatCount(Number(form.count))}</b></div><div><span>Кредиты</span><b>{formatCount(split.creditCount)}</b></div><div><span>Депозиты</span><b>{formatCount(split.deposits)}</b></div></div><SectionHeader title="Типы графиков платежей"/><div className="bar-list"><Bar label="Аннуитетный (ANN)" value={50}/><Bar label="Равные доли (RGM)" value={30} tone="purple"/><Bar label="SIMPLE" value={20} tone="mint"/></div><SectionHeader title="Тип процентной ставки"/><div className="bar-list"><Bar label="FIXED" value={Number(form.fixed_share)}/><Bar label="FLOAT" value={100 - Number(form.fixed_share)} tone="mint"/></div><div className="note"><b>Воспроизводимый режим</b><p>Одинаковые настройки, seed и версия алгоритма дают тот же канонический hash. Все поля повторно проверяются backend.</p></div></Card></div>
}

function Advanced({form, update, onGenerate, pending}: Props) {
  const bars = [18, 38, 76, 96, 84, 65, 49, 34, 24, 15, 9, 5]
  return <><div className="subnav"><span className="on">Суммы и сроки</span><span>Графики платежей</span><span>Ставки</span><span title="Контракт поддерживает prepayment_schedule">Досрочки</span><span title="Включаются только после проверки полей cfgen">Субсидии</span><span>Экспертные</span></div><div className="grid generator-grid"><Card><SectionHeader title="Распределение сумм" side={<span className="badge blue">Параметрическая</span>}/><div className="form-grid"><Field label="Минимальная сумма"><Input type="number" value={form.min_amount} onChange={e => update('min_amount', Number(e.target.value))}/></Field><Field label="Максимальная сумма"><Input type="number" value={form.max_amount} onChange={e => update('max_amount', Number(e.target.value))}/></Field><Field label="Модель распределения"><Select value={form.amount_distribution} onChange={e => update('amount_distribution', e.target.value)}><option value="lognormal">Логнормальная</option><option value="uniform">Равномерная</option><option value="normal">Нормальная</option></Select></Field><Field label="Seed"><Input type="number" value={form.seed} onChange={e => update('seed', Number(e.target.value))}/></Field></div><SectionHeader title="Диапазон ставок"/><div className="form-grid"><Field label="Минимальная ставка, %"><Input type="number" step="0.1" value={form.min_rate_percent} onChange={e => update('min_rate_percent', Number(e.target.value))}/></Field><Field label="Максимальная ставка, %"><Input type="number" step="0.1" value={form.max_rate_percent} onChange={e => update('max_rate_percent', Number(e.target.value))}/></Field></div><div className="divider"/><SectionHeader title="Распределение сроков"/><div className="form-grid"><Field label="От, месяцев"><Input type="number" value={form.min_term_months} onChange={e => update('min_term_months', Number(e.target.value))}/></Field><Field label="До, месяцев"><Input type="number" value={form.max_term_months} onChange={e => update('max_term_months', Number(e.target.value))}/></Field></div><div className="success-line">✓ Диапазоны и доли проверит backend перед сохранением</div><div className="footer-actions"><Button primary disabled={pending} onClick={onGenerate}>{pending ? 'Генерация…' : 'Сгенерировать'}</Button></div></Card><Card><SectionHeader title="Предпросмотр распределения сумм" side="Форма распределения"/><div className="histogram">{bars.map((height, index) => <div key={index} className="hist-bar" style={{height: `${height}%`}}/>)}</div><div className="axis"><span>{formatCount(Number(form.min_amount))} ₽</span><span>{formatCount(Number(form.max_amount))} ₽</span></div><SectionHeader title="Сроки кредитования" side="Настроенный диапазон"/><div className="bar-list"><Bar label={`от ${form.min_term_months} мес.`} value={25}/><Bar label="Средний диапазон" value={50}/><Bar label={`до ${form.max_term_months} мес.`} value={25} tone="purple"/></div><div className="note"><b>Ограничения внешнего движка</b><p>FLOAT использует только CBKEY1M. Для SIMPLE формируется явное погашение в конце срока. Субсидии не активируются без подтверждённого контракта полей.</p></div></Card></div></>
}
