import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChartSpline, Check, ChevronRight, Hash, Info, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { api, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, KPI, LoadingState, PageHeader, SectionHeader, Select, StatusBadge, Tabs } from '../components/ui'
import { Chart } from '../components/charts/Chart'
import { chartColors, limeAreaSeries } from '../components/charts/chartTheme'

type Snapshot = {id: string; source: string; external_id?: string; trade_date: string; retrieved_at: string; convention: string; data_hash: string; source_sha?: string; point_count: number}
type Curve = Snapshot & {points: {bucket_code: string; tenor_years: string; rate_decimal: string; rate_percent: string; shift_bp?: string}[]}

const tabs = [{key: 'curves', label: 'Кривые'}, {key: 'scenarios', label: 'Сценарии'}, {key: 'discount', label: 'Дисконтирование и NPV'}, {key: 'history', label: 'История кривых'}]

export function CurvesPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'curves'
  const snapshots = useQuery({queryKey: ['curves'], queryFn: () => api<Snapshot[]>('/curves')})
  const selected = params.get('snapshot') || snapshots.data?.[0]?.id
  const curve = useQuery({queryKey: ['curve', selected], queryFn: () => api<Curve>(`/curves/${selected}`), enabled: !!selected})
  const queryClient = useQueryClient()
  const refresh = useMutation({mutationFn: () => api<Snapshot>('/curves/refresh', {method: 'POST'}), onSuccess: () => queryClient.invalidateQueries({queryKey: ['curves']})})
  if (snapshots.isLoading) return <LoadingState />
  return (
    <>
      <PageHeader
        crumb="КРИВЫЕ СТАВОК"
        title="Кривые ставок"
        description={tab === 'scenarios' ? 'Управление базовыми и пользовательскими стресс-сценариями' : tab === 'discount' ? 'Влияние базовой и сценарной дисконтных кривых на PV и NPV' : tab === 'history' ? 'Сравнение рыночных кривых за разные даты' : 'Базовые и сценарные процентные кривые, сравнение по срокам'}
        actions={<Button variant="primary" size="lg" disabled={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw size={15} strokeWidth={2.2} /> {tab === 'scenarios' ? 'Создать сценарий' : tab === 'history' ? 'Загрузить снимок' : 'Получить последнюю кривую'}</Button>}
      />
      <Tabs items={tabs.map(item => ({label: item.label, to: `/curves${item.key === 'curves' ? '' : `?tab=${item.key}`}`, active: item.key === tab}))} />
      {refresh.error && <div className="mb-5"><ErrorState message={(refresh.error as Error).message} /></div>}
      {tab === 'curves' && <Curves snapshots={snapshots.data || []} curve={curve.data} />}
      {tab === 'scenarios' && <Scenarios />}
      {tab === 'discount' && <Discount snapshots={snapshots.data || []} />}
      {tab === 'history' && <History snapshots={snapshots.data || []} />}
    </>
  )
}

function Curves({snapshots, curve}: {snapshots: Snapshot[]; curve?: Curve}) {
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
        <StatusBadge status={curve.source === 'verified_external' ? 'Доступно' : 'Не проверено'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI icon={TrendingUp} label="Краткая ставка" value={points[0] ? formatPercentFromDecimal(points[0].rate_decimal) : '—'} sub={points[0]?.bucket_code || 'Нет точки'} />
        <KPI icon={TrendingUp} label="Средний срок" value={middle ? formatPercentFromDecimal(middle.rate_decimal) : '—'} sub={middle?.bucket_code || 'Нет точки'} />
        <KPI icon={TrendingUp} label="Длинная ставка" value={points.at(-1) ? formatPercentFromDecimal(points.at(-1)!.rate_decimal) : '—'} sub={points.at(-1)?.bucket_code || 'Нет точки'} />
        <KPI accent icon={Check} label="Источник" value={<span className="text-[19px]">{curve.source}</span>} sub={curve.source_sha ? `SHA ${curve.source_sha.slice(0, 8)}` : 'Версия указана в метаданных'} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.75fr_1fr] gap-5">
        <Card>
          <CardHeader title="Кривая по срокам" side={<span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime inline-block" /> Базовая</span>} />
          <Chart
            height={300}
            option={{
              xAxis: {type: 'category', data: points.map(point => point.bucket_code)},
              yAxis: {type: 'value', axisLabel: {color: chartColors.axis, fontSize: 11, formatter: (value: number) => `${value}%`}, splitLine: {lineStyle: {color: chartColors.grid, type: 'dashed'}}},
              tooltip: {trigger: 'axis', valueFormatter: value => `${Number(value).toLocaleString('ru-RU', {maximumFractionDigits: 2})}%`},
              series: [{...limeAreaSeries('Базовая кривая', points.map(point => Number(point.rate_decimal) * 100)), showSymbol: true}],
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
              <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Ставка QuantumTeam и прогноз CBKEY1M для FLOAT — разные сущности. Связь не предполагается автоматически.</p>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Точки кривой" side={<span className="font-mono text-[11px]">{curve.data_hash.slice(0, 12)}</span>} />
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>{['Бакет', 'Срок, лет', 'Ставка', 'Источник', 'Статус'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
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

function Scenarios() {
  const scenarios = useQuery({queryKey: ['curve-scenarios'], queryFn: () => api<{status: string; items: {id: number; code: string; name: string; scenario_type: string}[]; reason?: string}>('/curves/scenarios/available'), retry: false})
  const verified = [{code: 'parallel_up', name: 'Parallel up'}, {code: 'parallel_down', name: 'Parallel down'}, {code: 'short_up', name: 'Short up'}, {code: 'short_down', name: 'Short down'}, {code: 'steepener', name: 'Steepener'}, {code: 'flattener', name: 'Flattener'}]
  const items = scenarios.data?.items?.length ? scenarios.data.items : verified
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card>
        <CardHeader title="Стандартные сценарии" side={<StatusBadge status={scenarios.data?.status === 'available' ? 'Доступно' : 'Недоступно'} />} />
        <div className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <div key={item.code} className={`flex items-center gap-3.5 rounded-panel border p-3.5 transition-all duration-200 cursor-pointer ${index === 0 ? 'border-lime/50 bg-lime/6' : 'border-border bg-card2 hover:border-border-strong'}`}>
              <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${index === 0 ? 'bg-lime/15 text-lime' : 'bg-white/5 text-muted'}`}>
                {item.code.includes('down') ? <TrendingDown size={18} strokeWidth={1.8} /> : <TrendingUp size={18} strokeWidth={1.8} />}
              </span>
              <div className="flex-1 min-w-0">
                <strong className="block text-[12.5px]">{item.name}</strong>
                <small className="block text-[10.5px] text-faint mt-1">{scenarios.data?.items?.length ? `Реальный сценарий API · ${item.code}` : `Подтверждён исходным кодом SHA, сервис сейчас недоступен · ${item.code}`}</small>
              </div>
              <ChevronRight size={17} className="text-faint shrink-0" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Пользовательский сценарий" side={<Badge tone="outline">Редактор</Badge>} />
        <Field label="Название сценария" className="mb-4"><Input defaultValue="Повышение краткосрочных ставок" /></Field>
        <Field label="Тип сдвига" className="mb-4"><Select><option>По контрольным срокам</option></Select></Field>
        <SectionHeader title="Точки сдвига" />
        <table className="w-full border-collapse text-left mb-4">
          <thead>
            <tr>{['Срок', 'Сдвиг, б.п.'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-2.5">{head}</th>)}</tr>
          </thead>
          <tbody>
            {[['3 месяца', '+150'], ['1 год', '+125'], ['3 года', '+75'], ['5 лет', '+50'], ['10 лет', '+25']].map(row => (
              <tr key={row[0]} className="hover:bg-white/3 transition-colors">
                <td className="border-b border-border px-3 py-2.5 text-[12.5px]">{row[0]}</td>
                <td className="border-b border-border px-3 py-2.5 text-[12.5px] tnum text-lime font-semibold">{row[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary">Проверить</Button>
          <Button variant="primary" disabled={scenarios.data?.status !== 'available'} title="Сохранение доступно только при живом API QuantumTeam">Сохранить сценарий</Button>
        </div>
        <div className="rounded-panel bg-card2 border border-border p-3.5 mt-4">
          <b className="text-xs">При сохранении</b>
          <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Базовый снимок не меняется. Создаётся отдельный сценарий через реальный POST /api/v1/scenarios.</p>
        </div>
      </Card>
    </div>
  )
}

function Discount({snapshots}: {snapshots: Snapshot[]}) {
  const runs = useQuery({queryKey: ['runs'], queryFn: () => api<{run_id: string; type: string; result?: Record<string, unknown>}[]>('/runs')})
  const complete = runs.data?.find(run => run.result?.npv)
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Параметры дисконтирования" />
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field label="Объект"><Select><option>Последний рассчитанный портфель</option></Select></Field>
          <Field label="Кривая до"><Select><option>{snapshots[0] ? `${snapshots[0].trade_date} · ${snapshots[0].source}` : 'Нет снимка'}</option></Select></Field>
          <Field label="Кривая после"><Select><option>Parallel up · через сценарный анализ</option></Select></Field>
          <Field label="Дата оценки"><div className="h-10 rounded-xl bg-card2 border border-border px-3.5 flex items-center text-[13px] text-muted">Из версии портфеля</div></Field>
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI icon={Hash} label="NPV до" value={complete?.result?.npv ? formatMoney(String(complete.result.npv)) : '—'} sub={complete ? `Запуск ${complete.run_id.slice(0, 8)}` : 'Нет полного расчёта'} />
        <KPI icon={Hash} label="NPV после" value="—" sub="Выполните сценарий" />
        <KPI accent icon={TrendingUp} label="ΔNPV" value="—" sub="После применения кривой" />
        <KPI icon={ChartSpline} label="Точек в кривой" value={snapshots[0]?.point_count ?? '—'} sub={snapshots[0]?.source || 'Нет снимка'} />
      </div>
      <Card>
        <CardHeader title="Дисконт-факторы и приведённая стоимость" side="Только после расчёта" />
        <EmptyState icon={TrendingUp} title="Событийная детализация не выбрана" text="Полный NPV вычисляется только при наличии CF и DF для каждого ненулевого события; пропуски не агрегируются" />
        <div className="rounded-panel bg-card2 border border-border p-3.5 max-w-[640px] mx-auto">
          <b className="text-xs">Текущая методика</b>
          <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">ACT/365, continuous zero rate, линейная интерполяция zero rate без скрытой экстраполяции. Это явно маркированное допущение NPV Analytics, не «метод QuantumTeam».</p>
        </div>
      </Card>
    </div>
  )
}

function History({snapshots}: {snapshots: Snapshot[]}) {
  const ready = snapshots.length >= 2
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Историческое сравнение" />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Начальная дата"><Select><option>{snapshots[1] ? formatDate(snapshots[1].trade_date) : 'Нет снимка'}</option></Select></Field>
          <Field label="Конечная дата"><Select><option>{snapshots[0] ? formatDate(snapshots[0].trade_date) : 'Нет снимка'}</option></Select></Field>
        </div>
      </Card>
      {!ready && (
        <Card className="border-amber/25">
          <div className="flex items-start gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-2xl bg-amber/12 text-amber shrink-0"><Info size={22} strokeWidth={1.8} /></span>
            <div className="flex-1">
              <strong className="block text-[14px]">Нужны два реально сохранённых снимка</strong>
              <p className="text-muted text-xs leading-relaxed mt-1.5 mb-0">История строится только из immutable-снимков с источником, датой и hash. Отсутствующие прошлые кривые не генерируются.</p>
            </div>
            <Badge tone="amber">Ожидает данных</Badge>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Кривые на две даты" />
          {ready
            ? <EmptyState icon={ChartSpline} title="Выберите сопоставимые точки" text="Снимки доступны; детальная загрузка выполняется при выборе" />
            : <EmptyState icon={ChartSpline} title="История ставок пока недоступна" text="Добавьте исторические снимки через раздел «Источники данных»" />}
        </Card>
        <Card>
          <CardHeader title="Изменения по срокам" />
          {ready
            ? (
              <div className="flex items-center gap-3 py-4">
                <Check size={18} className="text-lime" strokeWidth={2.2} />
                <span className="text-[12.5px] text-muted">Снимки готовы к сравнению</span>
              </div>
            )
            : <EmptyState title="Нет сопоставимых точек" text="Результаты сравнения появятся здесь" />}
        </Card>
      </div>
    </div>
  )
}
