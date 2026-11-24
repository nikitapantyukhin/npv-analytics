import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, ChartSpline, Check, CircleAlert, Download, FileUp, Play, Plug, RefreshCw, ShieldCheck, Timer } from 'lucide-react'
import { api, formatDate } from '../lib/api'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KPI, PageHeader, SectionHeader, StatusBadge, Tabs } from '../components/ui'
import { cn } from '../lib/utils'

type Status = {checked_at: string; nosnitches: {status: string; available: boolean; sha: string; binary: string; checksum?: string}; quantum: {status: string; available: boolean; sha: string; base_url: string; error?: string}}
type Run = {run_id: string; type: string; status: string; stage: string; created_at: string; error_summary?: string; result?: Record<string, unknown>}
type Audit = {id: number; level: string; module: string; code: string; message: string; created_at: string}
type Issue = {id: number; code: string; message: string; severity: string; source: string; created_at: string}

const entries = [{key: 'connections', label: 'Подключения'}, {key: 'sources', label: 'Источники данных'}, {key: 'runs', label: 'Запуски расчётов'}, {key: 'logs', label: 'Проверки и журнал'}]

export function IntegrationsPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'connections'
  const client = useQueryClient()
  const status = useQuery({queryKey: ['integration-status'], queryFn: () => api<Status>('/integrations/status'), retry: false})
  const smoke = useMutation({
    mutationFn: () => api<Record<string, unknown>>('/integrations/smoke-test', {method: 'POST'}),
    onSuccess: async data => {
      await client.invalidateQueries({queryKey: ['integration-status']})
      toast.success('Сквозная проверка выполнена', {description: String(data.status || 'Результат в журнале')})
    },
    onError: error => toast.error('Проверка не удалась', {description: (error as Error).message}),
  })
  return (
    <>
      <PageHeader
        crumb="ДАННЫЕ И ИНТЕГРАЦИИ"
        title="Данные и интеграции"
        description="Подключения, загрузка данных, запуски вычислений и диагностика"
        actions={<Button variant="primary" size="lg" disabled={smoke.isPending} onClick={() => smoke.mutate()}><RefreshCw size={15} strokeWidth={2.2} /> {smoke.isPending ? 'Проверка…' : 'Проверить подключения'}</Button>}
      />
      <Tabs items={entries.map(item => ({label: item.label, to: `/integrations${item.key === 'connections' ? '' : `?tab=${item.key}`}`, active: item.key === tab}))} />
      {status.error && <div className="mb-5"><ErrorState message={(status.error as Error).message} /></div>}
      {tab === 'connections' && <Connections status={status.data} />}
      {tab === 'sources' && <Sources />}
      {tab === 'runs' && <Runs smoke={() => smoke.mutate()} pending={smoke.isPending} />}
      {tab === 'logs' && <Logs smoke={smoke.data} />}
    </>
  )
}

function Connections({status}: {status?: Status}) {
  const checked = Number(status?.nosnitches.available) + Number(status?.quantum.available)
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI icon={Plug} label="Интеграции" value="2" sub="Фактические внешние контракты" />
        <KPI accent icon={ShieldCheck} label="Доступно" value={`${checked} из 2`} sub={status ? `Проверено ${new Date(status.checked_at).toLocaleString('ru-RU')}` : 'Проверка выполняется'} />
        <KPI icon={Play} label="Режим cfgen" value={status?.nosnitches.available ? 'CLI' : '—'} sub={status?.nosnitches.binary || 'Не проверено'} />
        <KPI icon={CircleAlert} label="Ошибки" value={2 - checked} sub={checked === 2 ? 'Обе интеграции доступны' : 'См. карточки ниже'} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Service name="nosnitches-cashflow" description="Денежные потоки, графики платежей, диагностика" technology="Rust · cfgen" method="CLI / локальный бинарник" status={status?.nosnitches.status} sha={status?.nosnitches.sha} detail={status?.nosnitches.checksum ? `SHA-256 бинарника ${status.nosnitches.checksum}` : status?.nosnitches.binary} />
        <Service name="QuantumTeam" description="Базовые и сценарные процентные кривые" technology="Python · FastAPI" method="HTTP / REST" status={status?.quantum.status} sha={status?.quantum.sha} detail={status?.quantum.error || status?.quantum.base_url} />
      </div>
      <Card>
        <CardHeader title="Цепочка обработки данных" />
        <div className="flex items-center justify-between gap-3 max-lg:overflow-x-auto">
          {[{label: 'Генератор', sub: 'Наш модуль'}, {label: 'Денежные потоки', sub: 'nosnitches'}, {label: 'Кривые ставок', sub: 'QuantumTeam'}, {label: 'NPV + факторы', sub: 'Наш backend'}].map((stage, index, list) => (
            <div key={stage.label} className="contents">
              <div className="flex-1 min-w-[150px] rounded-panel bg-card2 border border-border px-3 py-4 text-center text-[12.5px] font-semibold">
                {stage.label}
                <small className="block text-[10px] text-faint font-normal mt-1.5">{stage.sub}</small>
              </div>
              {index < list.length - 1 && <ArrowRight size={19} className="text-lime shrink-0 max-lg:hidden" />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Service({name, description, technology, method, status, sha, detail}: {name: string; description: string; technology: string; method: string; status?: string; sha?: string; detail?: string}) {
  const rows = [['Технология', technology], ['Способ подключения', method], ['Доступность', status || 'Не проверено'], ['Версия', sha?.slice(0, 12) || '—'], ['Диагностика', detail || '—']]
  return (
    <Card hover>
      <CardHeader title={name} side={<StatusBadge status={status || 'Не проверено'} />} />
      <p className="text-[11.5px] text-muted mt-0 mb-1">{description}</p>
      <div className="border-t border-border my-3" />
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-5 py-2.5 border-b border-border last:border-0 text-[12px]">
          <span className="text-muted shrink-0">{label}</span>
          <b className="font-semibold text-right truncate max-w-[320px]" title={value}>{value}</b>
        </div>
      ))}
      <div className="flex justify-end gap-2.5 mt-4">
        <Button variant="secondary" size="sm">Проверить</Button>
        <Button variant="secondary" size="sm">Подробнее</Button>
      </div>
    </Card>
  )
}

function Sources() {
  const client = useQueryClient()
  const [file, setFile] = useState<File>()
  const [kind, setKind] = useState<'portfolio' | 'key-rates'>('portfolio')
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Выберите CSV-файл')
      const body = new FormData()
      body.append('file', file)
      return api<Record<string, unknown>>(kind === 'portfolio' ? '/portfolios/import?name=Импортированный%20портфель' : '/data/key-rates/import', {method: 'POST', body})
    },
    onSuccess: () => {
      client.invalidateQueries({queryKey: ['portfolios']})
      client.invalidateQueries({queryKey: ['runs']})
      toast.success('Файл проверен и сохранён')
    },
    onError: error => toast.error('Импорт не удался', {description: (error as Error).message}),
  })
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<{id: string; name: string; version: {deal_count: number; generator_version: string}}[]>('/portfolios')})
  const curves = useQuery({queryKey: ['curves'], queryFn: () => api<{id: string; source: string; point_count: number}[]>('/curves')})
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Импорт данных" />
          <div className="rounded-panel border border-dashed border-border-strong hover:border-lime/60 transition-colors min-h-[230px] flex flex-col items-center justify-center gap-2.5 p-5 text-center">
            <FileUp size={38} strokeWidth={1.4} className="text-lime" />
            <strong className="text-[13px]">{file?.name || 'Перетащите CSV-файл сюда'}</strong>
            <p className="text-[11px] text-faint m-0">Сделки по 48/49-польному контракту или CBKEY1M</p>
            <div className="w-[220px]">
              <select value={kind} onChange={event => setKind(event.target.value as 'portfolio' | 'key-rates')} className="w-full h-9 rounded-xl bg-field border border-border px-3 text-xs text-foreground outline-none focus:border-lime cursor-pointer [&>option]:bg-card2">
                <option value="portfolio">Сделки</option>
                <option value="key-rates">Ключевая ставка</option>
              </select>
            </div>
            <div className="flex gap-2.5 mt-1.5">
              <label className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#242424] border border-border-strong text-[13px] font-semibold cursor-pointer hover:border-lime/40 hover:text-lime transition-all">
                Выбрать файл
                <input type="file" accept=".csv,text/csv" hidden onChange={event => setFile(event.target.files?.[0])} />
              </label>
              <Button variant="primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? 'Проверка…' : 'Проверить и импортировать'}</Button>
            </div>
          </div>
          {upload.error && <p className="text-[11px] text-red mt-3 mb-0">{(upload.error as Error).message}</p>}
          {upload.data && <div className="flex items-center gap-2 text-[11px] text-lime mt-3"><Check size={14} strokeWidth={2.5} /> Файл проверен и сохранён: {JSON.stringify(upload.data)}</div>}
        </Card>
        <Card>
          <CardHeader title="Проверка загружаемых файлов" />
          {[['Структура CSV', 'Заголовки, обязательные столбцы и кодировка'], ['Финансовая валидация', 'Даты, суммы, знаки и типы ставок'], ['Контроль повторов', 'Уникальные идентификаторы сделок']].map(row => (
            <div key={row[0]} className="flex gap-3 py-3 border-b border-border last:border-0">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-lime/12 text-lime shrink-0 mt-0.5"><Check size={13} strokeWidth={3} /></span>
              <div>
                <b className="text-[12.5px]">{row[0]}</b>
                <p className="text-[10.5px] text-faint mt-1 mb-0">{row[1]}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <CardHeader title="Каталог наборов данных" side="Фактические записи backend" />
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>{['Категория', 'Источник', 'Версия', 'Количество', 'Состояние'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {portfolios.data?.map(item => (
              <tr key={item.id} className="hover:bg-white/3 transition-colors">
                <td className="border-b border-border px-3 py-3 text-[12.5px]">Сделки · {item.name}</td>
                <td className="border-b border-border px-3 py-3 text-[12px] text-muted">Генератор / импорт</td>
                <td className="border-b border-border px-3 py-3 text-[12px] tnum text-muted">{item.version.generator_version}</td>
                <td className="border-b border-border px-3 py-3 text-[12.5px] tnum">{item.version.deal_count}</td>
                <td className="border-b border-border px-3 py-3"><StatusBadge status="Доступно" /></td>
              </tr>
            ))}
            {curves.data?.map(item => (
              <tr key={item.id} className="hover:bg-white/3 transition-colors">
                <td className="border-b border-border px-3 py-3 text-[12.5px]">Кривая дисконтирования</td>
                <td className="border-b border-border px-3 py-3 text-[12px] text-muted">{item.source}</td>
                <td className="border-b border-border px-3 py-3 text-[12px] tnum text-muted">{item.id.slice(0, 8)}</td>
                <td className="border-b border-border px-3 py-3 text-[12.5px] tnum">{item.point_count}</td>
                <td className="border-b border-border px-3 py-3"><StatusBadge status="Доступно" /></td>
              </tr>
            ))}
            {!portfolios.data?.length && !curves.data?.length && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[12px] text-faint">Наборы данных ещё не загружены</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Runs({smoke, pending}: {smoke: () => void; pending: boolean}) {
  const runs = useQuery({queryKey: ['runs'], queryFn: () => api<Run[]>('/runs')})
  const items = runs.data || []
  const queued = items.filter(item => ['queued', 'running'].includes(item.status)).length
  const succeeded = items.filter(item => item.status === 'succeeded').length
  const failed = items.filter(item => item.status === 'failed').length
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI icon={Play} label="Всего запусков" value={items.length} sub="В текущей базе" />
        <KPI icon={Timer} label="В очереди" value={queued} sub="queued / running" />
        <KPI accent icon={Check} label="Завершено" value={succeeded} sub="Только succeeded" />
        <KPI icon={CircleAlert} label="Ошибки" value={failed} sub="failed" />
      </div>
      <Card>
        <CardHeader title="Этапы сквозного расчёта" side={<Button variant="secondary" size="sm" disabled={pending} onClick={smoke}><Play size={13} /> Сквозной тест</Button>} />
        <div className="flex items-center justify-between gap-3 max-lg:overflow-x-auto">
          {['① Валидация', '② Потоки', '③ Кривые', '④ NPV', '⑤ Факторы'].map((stage, index, list) => (
            <div key={stage} className="contents">
              <div className="flex-1 min-w-[120px] rounded-panel bg-card2 border border-border px-3 py-3.5 text-center text-[12px] font-semibold whitespace-nowrap">{stage}</div>
              {index < list.length - 1 && <ArrowRight size={17} className="text-lime shrink-0 max-lg:hidden" />}
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-faint mt-3 mb-0">Проценты не показываются: внешние источники не дают достоверного progress.</p>
      </Card>
      <Card>
        <CardHeader title="История вычислений" side={`${items.length} запусков`} />
        {items.length ? (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr>{['Время', 'ID', 'Тип', 'Этап', 'Статус', 'Диагностика'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.run_id} className="hover:bg-white/3 transition-colors">
                    <td className="border-b border-border px-3 py-3 text-[12px] text-muted tnum">{new Date(item.created_at).toLocaleString('ru-RU')}</td>
                    <td className="border-b border-border px-3 py-3 text-[12px] tnum">{item.run_id.slice(0, 12)}</td>
                    <td className="border-b border-border px-3 py-3 text-[12.5px]">{item.type}</td>
                    <td className="border-b border-border px-3 py-3 text-[12px] text-muted">{item.stage}</td>
                    <td className="border-b border-border px-3 py-3"><StatusBadge status={item.status} /></td>
                    <td className="border-b border-border px-3 py-3 text-[12px] text-muted max-w-[280px] truncate">{item.error_summary || String(item.result?.valuation_reason || item.result?.cashflow_status || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Play} title="Расчёты ещё не запускались" text="После генерации, денежных потоков или NPV здесь появится история заданий" />
        )}
      </Card>
    </div>
  )
}

function Logs({smoke}: {smoke?: Record<string, unknown>}) {
  const events = useQuery({queryKey: ['audit-events'], queryFn: () => api<Audit[]>('/audit-events')})
  const issues = useQuery({queryKey: ['validation-issues'], queryFn: () => api<Issue[]>('/validation-issues')})
  const [level, setLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all')
  const [autoscroll, setAutoscroll] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)

  const lines = [
    ...(events.data || []).map(item => ({time: item.created_at, level: item.level, source: item.module, code: item.code, message: item.message})),
    ...(issues.data || []).map(item => ({time: item.created_at, level: item.severity, source: item.source, code: item.code, message: item.message})),
  ].sort((a, b) => a.time.localeCompare(b.time))
  const filtered = lines.filter(line => level === 'all' || line.level === level || (level === 'warning' && line.level === 'warn'))

  useEffect(() => {
    if (autoscroll && panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight
  }, [filtered.length, autoscroll])

  const download = () => {
    const text = filtered.map(line => `${line.time} [${line.level.toUpperCase()}] ${line.source} ${line.code} — ${line.message}`).join('\n')
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'npv-analytics-log.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Проверки и диагностика" side={smoke ? <StatusBadge status={String(smoke.status)} /> : 'Статус: не запущено'} />
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
          {[{icon: ShieldCheck, title: 'Формат сделок', text: 'Общий серверный валидатор CSV'}, {icon: ChartSpline, title: 'Кривые ставок', text: 'Проверка API и точек'}, {icon: Play, title: 'Сквозной тест', text: 'Потоки → DF → NPV'}].map(item => (
            <div key={item.title} className="rounded-panel bg-card2 border border-border p-4 flex flex-col gap-2.5">
              <item.icon size={24} strokeWidth={1.6} className="text-lime" />
              <strong className="text-[12.5px]">{item.title}</strong>
              <p className="text-[10.5px] text-faint m-0">{item.text}</p>
              <Button variant="secondary" size="sm" className="self-start mt-1">Проверить</Button>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Журнал событий" side={`${filtered.length} записей`} />
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          {(['all', 'info', 'warning', 'error'] as const).map(key => (
            <button
              key={key}
              onClick={() => setLevel(key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[11px] font-semibold border cursor-pointer transition-all',
                level === key ? 'bg-lime text-ink border-lime' : 'bg-card2 text-muted border-border hover:border-border-strong',
              )}
            >
              {{all: 'Все уровни', info: 'info', warning: 'warning', error: 'error'}[key]}
            </button>
          ))}
          <label className="flex items-center gap-2 text-[11px] text-muted ml-auto cursor-pointer select-none">
            <button
              role="switch"
              aria-checked={autoscroll}
              onClick={() => setAutoscroll(value => !value)}
              className={cn('w-9 h-5 rounded-full relative transition-colors cursor-pointer border-0', autoscroll ? 'bg-lime' : 'bg-white/15')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', autoscroll ? 'left-[18px]' : 'left-0.5')} />
            </button>
            Автоскролл
          </label>
          <Button variant="secondary" size="sm" onClick={download}><Download size={13} /> Скачать лог</Button>
        </div>
        <div ref={panelRef} className="rounded-panel bg-[#0A0A0A] border border-border p-4 h-[340px] overflow-auto font-mono text-[11.5px] leading-[1.9]">
          {filtered.length ? filtered.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap break-all">
              <span className="text-faint">{new Date(line.time).toLocaleString('ru-RU')} </span>
              <span className={cn('font-bold', line.level === 'error' ? 'text-red' : line.level === 'warning' || line.level === 'warn' ? 'text-amber' : 'text-lime')}>[{line.level.toUpperCase()}]</span>
              <span className="text-muted"> {line.source} · {line.code} — {line.message}</span>
            </div>
          )) : <span className="text-faint">События пока отсутствуют</span>}
        </div>
        <div className="rounded-panel bg-card2 border border-border p-3.5 mt-4">
          <b className="text-xs">Диагностика расчётного движка</b>
          <p className="text-[11px] leading-relaxed text-muted mt-1 mb-0">Поля исходных ошибок: deal_id, severity, code, field, message. Ошибки импорта и частичные результаты не скрываются.</p>
        </div>
      </Card>
    </div>
  )
}
