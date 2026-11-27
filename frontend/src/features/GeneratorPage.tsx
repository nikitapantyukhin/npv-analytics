import { useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Check, CircleAlert, Coins, Dices, Landmark, Layers, Sparkles, X } from 'lucide-react'
import { api, formatCount } from '../lib/api'
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, SectionHeader, Select, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { chartColors, roundedBarSeries } from '../components/charts/chartTheme'
import { cn } from '../lib/utils'

type Generated = {status: string; error_summary?: string; result?: {portfolio_id: string; credit_count: number; deposit_count: number}}

const schema = z.object({
  name: z.string().min(1, 'Укажите название').max(200, 'Максимум 200 символов'),
  portfolio_type: z.enum(['mixed', 'credit', 'deposit']),
  count: z.number({error: 'Укажите число'}).int().min(1, 'Минимум 1 сделка').max(100000, 'Максимум 100 000'),
  valuation_date: z.string().min(1, 'Укажите дату'),
  seed: z.number({error: 'Укажите число'}).int(),
  credit_share: z.number().min(0).max(100),
  min_amount: z.number({error: 'Укажите число'}).positive(),
  max_amount: z.number({error: 'Укажите число'}).positive(),
  min_term_months: z.number({error: 'Укажите число'}).int().min(1).max(360),
  max_term_months: z.number({error: 'Укажите число'}).int().min(1).max(360),
  min_rate_percent: z.number({error: 'Укажите число'}).min(0).max(100),
  max_rate_percent: z.number({error: 'Укажите число'}).min(0).max(100),
  fixed_share: z.number().min(0).max(100),
  amount_distribution: z.enum(['lognormal', 'uniform', 'normal']),
}).refine(values => values.min_amount < values.max_amount, {message: 'Минимум должен быть меньше максимума', path: ['max_amount']})
  .refine(values => values.min_term_months <= values.max_term_months, {message: 'Срок «от» должен быть не больше срока «до»', path: ['max_term_months']})
  .refine(values => values.min_rate_percent <= values.max_rate_percent, {message: 'Минимальная ставка должна быть не больше максимальной', path: ['max_rate_percent']})

type FormValues = z.infer<typeof schema>

const defaultValues: FormValues = {
  name: 'Синтетический портфель',
  portfolio_type: 'mixed',
  count: 1000,
  valuation_date: new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Moscow'}).format(new Date()),
  seed: 42,
  credit_share: 70,
  min_amount: 100000,
  max_amount: 5000000,
  min_term_months: 6,
  max_term_months: 60,
  min_rate_percent: 8,
  max_rate_percent: 24,
  fixed_share: 70,
  amount_distribution: 'lognormal',
}

const portfolioTypes = [
  {value: 'credit', label: 'Кредитный', hint: 'Только выдачи', icon: Landmark},
  {value: 'deposit', label: 'Депозитный', hint: 'Только привлечение', icon: Coins},
  {value: 'mixed', label: 'Смешанный', hint: 'Кредиты и депозиты', icon: Layers},
] as const

export function GeneratorPage() {
  const [params] = useSearchParams()
  const advanced = params.get('mode') === 'advanced'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<FormValues>({resolver: zodResolver(schema), defaultValues, mode: 'onChange'})
  const values = form.watch()

  const generation = useMutation({
    mutationFn: async (payload: FormValues) => {
      let run = await api<Generated & {run_id: string}>('/portfolios/generate', {
        method: 'POST',
        body: JSON.stringify({...payload, min_amount: String(payload.min_amount), max_amount: String(payload.max_amount), min_rate_percent: String(payload.min_rate_percent), max_rate_percent: String(payload.max_rate_percent)}),
      })
      for (let attempt = 0; run.status === 'queued' || run.status === 'running'; attempt += 1) {
        if (attempt >= 120) throw new Error('Генерация продолжается в фоне. Откройте «Запуски расчётов».')
        await new Promise(resolve => window.setTimeout(resolve, 500))
        run = await api<Generated & {run_id: string}>(`/runs/${run.run_id}`)
      }
      if (run.status !== 'succeeded' || !run.result?.portfolio_id) throw new Error(run.error_summary || 'Не удалось создать портфель')
      return run
    },
    onSuccess: async data => {
      await queryClient.invalidateQueries({queryKey: ['portfolios']})
      toast.success('Портфель сгенерирован', {description: `${formatCount((data.result?.credit_count || 0) + (data.result?.deposit_count || 0))} сделок сохранено`})
      if (data.result?.portfolio_id) navigate(`/portfolios/${data.result.portfolio_id}`)
    },
    onError: error => toast.error('Генерация не удалась', {description: (error as Error).message}),
  })

  const split = useMemo(() => {
    const credit = values.portfolio_type === 'credit' ? 100 : values.portfolio_type === 'deposit' ? 0 : Number(values.credit_share)
    const creditCount = Math.round(Number(values.count) * credit / 100)
    return {credit, creditCount, deposits: Number(values.count) - creditCount}
  }, [values.portfolio_type, values.credit_share, values.count])

  const submit = form.handleSubmit(data => generation.mutate(data))

  return (
    <>
      <PageHeader
        crumb="ГЕНЕРАТОР СДЕЛОК"
        title="Генератор сделок"
        description={advanced ? 'Детальная настройка распределений и условий кредитных и депозитных сделок' : 'Сформируйте синтетический портфель с контролируемой структурой'}
        actions={advanced
          ? <Button variant="primary" size="lg" disabled={generation.isPending} onClick={submit}><Sparkles size={17} strokeWidth={2.2} /> Сгенерировать</Button>
          : <Link to="/integrations?tab=runs&type=generation"><Button variant="secondary">История генераций</Button></Link>}
      />
      <Tabs items={[{label: 'Простой', to: '/generator', active: !advanced}, {label: 'Расширенный', to: '/generator?mode=advanced', active: advanced}]} />
      {generation.error && <div className="mb-5"><ErrorState message={(generation.error as Error).message} /></div>}
      {advanced
        ? <Advanced form={form} onGenerate={submit} pending={generation.isPending} />
        : <Simple form={form} split={split} onGenerate={submit} pending={generation.isPending} />}
    </>
  )
}

type Form = ReturnType<typeof useForm<FormValues>>
type Props = {form: Form; onGenerate: () => void; pending: boolean}

function TypeCards({form}: {form: Form}) {
  return (
    <Controller
      control={form.control}
      name="portfolio_type"
      render={({field}) => (
        <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
          {portfolioTypes.map(type => {
            const selected = field.value === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => field.onChange(type.value)}
                className={cn(
                  'rounded-panel border p-3.5 text-left transition-all duration-200 cursor-pointer',
                  selected ? 'border-lime bg-lime/8 shadow-[0_0_0_3px_rgba(198,242,78,0.12)]' : 'border-border bg-field hover:border-border-strong',
                )}
              >
                <type.icon size={19} strokeWidth={1.8} className={selected ? 'text-lime' : 'text-muted'} />
                <div className={cn('text-[12.5px] font-semibold mt-2', selected ? 'text-foreground' : 'text-muted')}>{type.label}</div>
                <div className="text-[10.5px] text-faint mt-0.5">{type.hint}</div>
              </button>
            )
          })}
        </div>
      )}
    />
  )
}

function SeedField({form, className}: {form: Form; className?: string}) {
  return (
    <Field label="Seed генератора" error={form.formState.errors.seed?.message} className={className}>
      <div className="relative">
        <Input type="number" {...form.register('seed', {valueAsNumber: true})} className="pr-11" />
        <button
          type="button"
          title="Случайный seed"
          onClick={() => form.setValue('seed', Math.floor(Math.random() * 1_000_000), {shouldValidate: true})}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-lg bg-lime/12 text-lime cursor-pointer border-0 hover:bg-lime/25 transition-colors"
        >
          <Dices size={14} />
        </button>
      </div>
    </Field>
  )
}

function ShareSlider({form, split}: {form: Form; split: {credit: number; creditCount: number; deposits: number}}) {
  const disabled = form.watch('portfolio_type') !== 'mixed'
  const credit = split.credit
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>Кредиты</span>
        <b className="text-foreground tnum">{credit}%</b>
      </div>
      <input
        type="range"
        aria-label="Доля кредитов"
        min={0}
        max={100}
        value={credit}
        disabled={disabled}
        className="lime-range"
        style={{'--fill': `${credit}%`} as React.CSSProperties}
        onChange={event => form.setValue('credit_share', Number(event.target.value), {shouldValidate: true})}
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>Депозиты</span>
        <b className="text-foreground tnum">{100 - credit}%</b>
      </div>
    </div>
  )
}

function FixedShare({form}: {form: Form}) {
  const fixed = form.watch('fixed_share')
  return <Field label={`Доля FIXED ${fixed}% · FLOAT ${100 - fixed}%`} className="mt-4">
    <input type="range" min={0} max={100} aria-label="Доля FIXED" className="lime-range"
      style={{'--fill': `${fixed}%`} as React.CSSProperties} {...form.register('fixed_share', {valueAsNumber: true})} />
  </Field>
}

function PreviewBar({label, value, tone = 'lime'}: {label: string; value: number; tone?: 'lime' | 'olive' | 'steel'}) {
  const color = tone === 'lime' ? chartColors.lime : tone === 'olive' ? chartColors.olive : chartColors.steel
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

function Simple({form, split, onGenerate, pending}: Props & {split: {credit: number; creditCount: number; deposits: number}}) {
  const values = form.watch()
  const errors = form.formState.errors
  const checks = [
    {label: `Количество сделок: ${formatCount(Number(values.count) || 0)}`, ok: Number(values.count) >= 1 && Number(values.count) <= 100000},
    {label: 'Диапазон сумм задан корректно', ok: Number(values.min_amount) < Number(values.max_amount)},
    {label: 'Диапазон сроков задан корректно', ok: Number(values.min_term_months) <= Number(values.max_term_months)},
    {label: 'Диапазон ставок задан корректно', ok: Number(values.min_rate_percent) <= Number(values.max_rate_percent)},
    {label: 'Seed задан — результат воспроизводим', ok: Number.isFinite(Number(values.seed))},
  ]
  const ready = checks.every(check => check.ok)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.18fr_0.82fr] gap-5 items-start">
      <Card>
        <CardHeader title="Основные параметры" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Название портфеля" error={errors.name?.message}><Input {...form.register('name')} /></Field>
          <Field label="Количество сделок" error={errors.count?.message}><Input type="number" min={1} max={100000} {...form.register('count', {valueAsNumber: true})} /></Field>
          <div className="col-span-2 max-md:col-span-1">
            <span className="block text-xs font-medium text-muted mb-2">Тип портфеля</span>
            <TypeCards form={form} />
          </div>
          <Field label="Дата оценки" error={errors.valuation_date?.message}><Input type="date" {...form.register('valuation_date')} /></Field>
          <Field label="Модель сумм">
            <Select {...form.register('amount_distribution')}>
              <option value="lognormal">Логнормальная</option>
              <option value="uniform">Равномерная</option>
              <option value="normal">Нормальная</option>
            </Select>
          </Field>
          <SeedField form={form} className="col-span-2 max-md:col-span-1" />
        </div>
        <div className="border-t border-border my-5" />
        <SectionHeader title="Соотношение инструментов" />
        <ShareSlider form={form} split={split} />
        <FixedShare form={form} />
        <div className="flex justify-end gap-2.5 mt-6">
          <Button variant="secondary" type="button" onClick={async () => {
            if (await form.trigger()) toast.success('Настройки прошли проверку')
            else toast.error('Проверьте выделенные параметры')
          }}>Проверить настройки</Button>
          <Button variant="primary" size="lg" disabled={pending || !ready} onClick={onGenerate}>
            <Sparkles size={17} strokeWidth={2.2} /> {pending ? 'Генерация…' : 'Сгенерировать портфель'}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Предварительная проверка" side={<Badge tone={ready ? 'lime' : 'amber'}>{ready ? 'Готово к генерации' : 'Проверьте параметры'}</Badge>} />
        <div className="flex flex-col gap-2.5 mb-5">
          {checks.map(check => (
            <div key={check.label} className="flex items-center gap-2.5 text-[12.5px]">
              <span className={cn('grid place-items-center w-5 h-5 rounded-full shrink-0', check.ok ? 'bg-lime/12 text-lime' : 'bg-red/12 text-red')}>
                {check.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
              </span>
              <span className={check.ok ? 'text-muted' : 'text-red'}>{check.label}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[{label: 'Сделок', value: formatCount(Number(values.count) || 0)}, {label: 'Кредиты', value: formatCount(split.creditCount)}, {label: 'Депозиты', value: formatCount(split.deposits)}].map(stat => (
            <div key={stat.label} className="rounded-xl bg-card2 border border-border px-3 py-3 flex flex-col gap-1">
              <span className="text-[10.5px] text-faint">{stat.label}</span>
              <b className="text-[17px] tnum">{stat.value}</b>
            </div>
          ))}
        </div>
        <SectionHeader title="Тип процентной ставки" />
        <div className="flex flex-col gap-3.5">
          <PreviewBar label="FIXED" value={Number(values.fixed_share)} />
          <PreviewBar label="FLOAT · CBKEY1M" value={100 - Number(values.fixed_share)} tone="olive" />
        </div>
        <div className="rounded-panel bg-card2 border border-border p-3.5 mt-5">
          <b className="text-xs">Воспроизводимый режим</b>
          <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Одинаковые настройки, seed и версия алгоритма дают тот же канонический hash. Все поля повторно проверяются backend.</p>
        </div>
      </Card>
    </div>
  )
}

function histogramWeights(values: FormValues): number[] {
  const {min_amount: min, max_amount: max, amount_distribution: distribution} = values
  if (!(min > 0 && min < max)) return []
  const count = 12
  return Array.from({length: count}, (_, index) => {
    const left = min + index / count * (max - min)
    const right = min + (index + 1) / count * (max - min)
    if (distribution === 'lognormal') return Math.log(right / left)
    if (distribution === 'normal') return Math.exp(-0.5 * ((index + 0.5 - count / 2) / 2) ** 2)
    return 1
  })
}

function Advanced({form, onGenerate, pending}: Props) {
  const values = form.watch()
  const errors = form.formState.errors
  const histogram = histogramWeights(values)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.18fr_0.82fr] gap-5 items-start">
      <Card>
        <CardHeader title="Распределение сумм" side={<Badge tone="outline">Параметрическая</Badge>} />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Минимальная сумма" error={errors.min_amount?.message}><Input type="number" {...form.register('min_amount', {valueAsNumber: true})} /></Field>
          <Field label="Максимальная сумма" error={errors.max_amount?.message}><Input type="number" {...form.register('max_amount', {valueAsNumber: true})} /></Field>
          <Field label="Модель распределения">
            <Select {...form.register('amount_distribution')}>
              <option value="lognormal">Логнормальная</option>
              <option value="uniform">Равномерная</option>
              <option value="normal">Нормальная</option>
            </Select>
          </Field>
          <SeedField form={form} />
        </div>
        <div className="border-t border-border my-5" />
        <SectionHeader title="Диапазон ставок" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Минимальная ставка, %" error={errors.min_rate_percent?.message}><Input type="number" step="0.1" {...form.register('min_rate_percent', {valueAsNumber: true})} /></Field>
          <Field label="Максимальная ставка, %" error={errors.max_rate_percent?.message}><Input type="number" step="0.1" {...form.register('max_rate_percent', {valueAsNumber: true})} /></Field>
        </div>
        <div className="border-t border-border my-5" />
        <SectionHeader title="Распределение сроков" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="От, месяцев" error={errors.min_term_months?.message}><Input type="number" {...form.register('min_term_months', {valueAsNumber: true})} /></Field>
          <Field label="До, месяцев" error={errors.max_term_months?.message}><Input type="number" {...form.register('max_term_months', {valueAsNumber: true})} /></Field>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-lime mt-4">
          <Check size={14} strokeWidth={2.5} /> Диапазоны и доли проверит backend перед сохранением
        </div>
        <FixedShare form={form} />
        <div className="flex justify-end gap-2.5 mt-6">
          <Button variant="primary" size="lg" disabled={pending} onClick={onGenerate}>
            <Sparkles size={17} strokeWidth={2.2} /> {pending ? 'Генерация…' : 'Сгенерировать'}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Предпросмотр распределения сумм" side={<Badge tone="outline">Форма распределения</Badge>} />
        <Chart
          height={190}
          option={{
            grid: {left: 0, right: 0, top: 10, bottom: 0},
            legend: {show: false},
            xAxis: {show: false, type: 'category', data: histogram.map((_, index) => String(index + 1))},
            yAxis: {show: false, type: 'value'},
            tooltip: {trigger: 'axis', formatter: params => `Интервал ${(params as {dataIndex: number}[])[0].dataIndex + 1} · условная плотность`},
            series: [roundedBarSeries('Плотность', histogram, chartColors.lime, {barMaxWidth: 18})],
          }}
        />
        <div className="flex justify-between text-[10.5px] text-faint mt-2 mb-6">
          <span>{formatCount(Number(values.min_amount) || 0)} ₽</span>
          <span>{formatCount(Number(values.max_amount) || 0)} ₽</span>
        </div>
        <SectionHeader title="Сроки кредитования" side="Настроенный диапазон" />
        <p className="text-xs text-muted">Сроки выбираются равномерно от {values.min_term_months} до {values.max_term_months} месяцев включительно.</p>
        <div className="rounded-panel bg-card2 border border-border p-3.5 mt-5 flex gap-3">
          <AlertTriangle size={16} className="text-amber shrink-0 mt-0.5" strokeWidth={1.8} />
          <div>
            <b className="text-xs">Ограничения внешнего движка</b>
            <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">FLOAT использует только CBKEY1M. Для SIMPLE формируется явное погашение в конце срока. Субсидии не активируются без подтверждённого контракта полей.</p>
          </div>
        </div>
        {Object.keys(errors).length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-red mt-4">
            <CircleAlert size={14} /> Исправьте отмеченные поля перед генерацией
          </div>
        )}
      </Card>
    </div>
  )
}
