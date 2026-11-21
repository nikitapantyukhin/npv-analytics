import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, formatDate } from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorState, KPI, PageHeader, SectionHeader, StatusBadge, Tabs } from '../components/ui'

type Status = {checked_at: string; nosnitches: {status: string; available: boolean; sha: string; binary: string; checksum?: string}; quantum: {status: string; available: boolean; sha: string; base_url: string; error?: string}}
type Run = {run_id: string; type: string; status: string; stage: string; created_at: string; error_summary?: string; result?: Record<string, unknown>}
type Audit = {id: number; level: string; module: string; code: string; message: string; created_at: string}

const entries = [{key: 'connections', label: 'Подключения'}, {key: 'sources', label: 'Источники данных'}, {key: 'runs', label: 'Запуски расчётов'}, {key: 'logs', label: 'Проверки и журнал'}]

export function IntegrationsPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'connections'
  const client = useQueryClient()
  const status = useQuery({queryKey: ['integration-status'], queryFn: () => api<Status>('/integrations/status'), retry: false})
  const smoke = useMutation({mutationFn: () => api<Record<string, unknown>>('/integrations/smoke-test', {method: 'POST'}), onSuccess: () => client.invalidateQueries({queryKey: ['integration-status']})})
  return <>
    <PageHeader crumb="ДАННЫЕ И ИНТЕГРАЦИИ" title="Данные и интеграции" description="Подключения, загрузка данных, запуски вычислений и диагностика" actions={<Button primary disabled={smoke.isPending} onClick={() => smoke.mutate()}>↻ {smoke.isPending ? 'Проверка…' : 'Проверить подключения'}</Button>} />
    <Tabs items={entries.map(item => ({label: item.label, to: `/integrations${item.key === 'connections' ? '' : `?tab=${item.key}`}`, active: item.key === tab}))}/>
    {status.error && <ErrorState message={(status.error as Error).message}/>}
    {tab === 'connections' && <Connections status={status.data}/>}
    {tab === 'sources' && <Sources/>}
    {tab === 'runs' && <Runs/>}
    {tab === 'logs' && <Logs smoke={smoke.data}/>}
  </>
}

function Connections({status}: {status?: Status}) {
  const checked = Number(status?.nosnitches.available) + Number(status?.quantum.available)
  return <><div className="kpi-grid"><KPI label="Интеграции" value="2" sub="Фактические внешние контракты" icon="⛓"/><KPI label="Доступно" value={`${checked} из 2`} sub={status ? `Проверено ${new Date(status.checked_at).toLocaleString('ru-RU')}` : 'Проверка выполняется'} tone="violet" icon="✓"/><KPI label="Режим cfgen" value={status?.nosnitches.available ? 'CLI' : '—'} sub={status?.nosnitches.binary || 'Не проверено'} icon="▶"/><KPI label="Ошибки" value={2 - checked} sub={checked === 2 ? 'Обе интеграции доступны' : 'См. карточки ниже'} tone="green" icon="!"/></div><div className="grid half-grid"><Service name="nosnitches-cashflow" description="Денежные потоки, графики платежей, диагностика" technology="Rust · cfgen" method="CLI / локальный бинарник" status={status?.nosnitches.status} sha={status?.nosnitches.sha} detail={status?.nosnitches.checksum ? `SHA-256 бинарника ${status.nosnitches.checksum}` : status?.nosnitches.binary}/><Service name="QuantumTeam" description="Базовые и сценарные процентные кривые" technology="Python · FastAPI" method="HTTP / REST" status={status?.quantum.status} sha={status?.quantum.sha} detail={status?.quantum.error || status?.quantum.base_url}/></div><Card><SectionHeader title="Цепочка обработки данных"/><div className="pipeline"><div>Генератор<small>Наш модуль</small></div><span>→</span><div>Денежные потоки<small>nosnitches</small></div><span>→</span><div>Кривые ставок<small>QuantumTeam</small></div><span>→</span><div>NPV + факторы<small>Наш backend</small></div></div></Card></>
}

function Service({name, description, technology, method, status, sha, detail}: {name: string; description: string; technology: string; method: string; status?: string; sha?: string; detail?: string}) {
  return <Card><SectionHeader title={name} side={<StatusBadge status={status || 'Не проверено'}/>}/><div className="service-sub">{description}</div><div className="divider"/><div className="kv"><span>Технология</span><b>{technology}</b></div><div className="kv"><span>Способ подключения</span><b>{method}</b></div><div className="kv"><span>Доступность</span><b>{status || 'Не проверено'}</b></div><div className="kv"><span>Версия</span><b title={sha}>{sha?.slice(0, 12) || '—'}</b></div><div className="kv"><span>Диагностика</span><b className="truncate" title={detail}>{detail || '—'}</b></div><div className="footer-actions"><Button>Проверить</Button><Button>Подробнее</Button></div></Card>
}

function Sources() {
  const client = useQueryClient()
  const [file, setFile] = useState<File>()
  const [kind, setKind] = useState<'portfolio' | 'key-rates'>('portfolio')
  const upload = useMutation({mutationFn: async () => {if (!file) throw new Error('Выберите CSV-файл'); const body = new FormData(); body.append('file', file); return api<Record<string, unknown>>(kind === 'portfolio' ? '/portfolios/import?name=Импортированный%20портфель' : '/data/key-rates/import', {method: 'POST', body})}, onSuccess: () => {client.invalidateQueries({queryKey: ['portfolios']}); client.invalidateQueries({queryKey: ['runs']})}})
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<{id: string; name: string; version: {deal_count: number; generator_version: string}}[]>('/portfolios')})
  const curves = useQuery({queryKey: ['curves'], queryFn: () => api<{id: string; source: string; point_count: number}[]>('/curves')})
  return <><div className="grid half-grid"><Card><SectionHeader title="Импорт данных"/><div className="upload"><span>⇧</span><strong>{file?.name || 'Перетащите CSV-файл сюда'}</strong><p>Сделки по 48/49-польному контракту или CBKEY1M</p><select className="native-input compact" value={kind} onChange={event => setKind(event.target.value as 'portfolio' | 'key-rates')}><option value="portfolio">Сделки</option><option value="key-rates">Ключевая ставка</option></select><label className="btn file-button">Выбрать файл<input type="file" accept=".csv,text/csv" hidden onChange={event => setFile(event.target.files?.[0])}/></label><Button primary disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? 'Проверка…' : 'Проверить и импортировать'}</Button></div>{upload.error && <p className="form-error">{(upload.error as Error).message}</p>}{upload.data && <div className="success-line">✓ Файл проверен и сохранён: {JSON.stringify(upload.data)}</div>}</Card><Card><SectionHeader title="Проверка загружаемых файлов"/>{[['Структура CSV', 'Заголовки, обязательные столбцы и кодировка'], ['Финансовая валидация', 'Даты, суммы, знаки и типы ставок'], ['Контроль повторов', 'Уникальные идентификаторы сделок']].map(row => <div className="check-row" key={row[0]}><span className="check-symbol">✓</span><div><b>{row[0]}</b><p>{row[1]}</p></div></div>)}</Card></div><Card><SectionHeader title="Каталог наборов данных" side="Фактические записи backend"/><table className="data-table"><thead><tr><th>Категория</th><th>Источник</th><th>Версия</th><th>Количество</th><th>Состояние</th></tr></thead><tbody>{portfolios.data?.map(item => <tr key={item.id}><td>Сделки · {item.name}</td><td>Генератор / импорт</td><td>{item.version.generator_version}</td><td>{item.version.deal_count}</td><td><StatusBadge status="Доступно"/></td></tr>)}{curves.data?.map(item => <tr key={item.id}><td>Кривая дисконтирования</td><td>{item.source}</td><td>{item.id.slice(0, 8)}</td><td>{item.point_count}</td><td><StatusBadge status="Доступно"/></td></tr>)}{!portfolios.data?.length && !curves.data?.length && <tr><td colSpan={5}>Наборы данных ещё не загружены</td></tr>}</tbody></table></Card></>
}

function Runs() {
  const runs = useQuery({queryKey: ['runs'], queryFn: () => api<Run[]>('/runs')})
  const items = runs.data || []
  const queued = items.filter(item => ['queued', 'running'].includes(item.status)).length
  const succeeded = items.filter(item => item.status === 'succeeded').length
  const failed = items.filter(item => item.status === 'failed').length
  return <><div className="kpi-grid"><KPI label="Всего запусков" value={items.length} sub="В текущей базе" icon="▶"/><KPI label="В очереди" value={queued} sub="queued / running" tone="violet" icon="◷"/><KPI label="Завершено" value={succeeded} sub="Только succeeded" tone="green" icon="✓"/><KPI label="Ошибки" value={failed} sub="failed" icon="!"/></div><Card><SectionHeader title="Этапы сквозного расчёта"/><div className="pipeline"><div>① Валидация</div><span>→</span><div>② Потоки</div><span>→</span><div>③ Кривые</div><span>→</span><div>④ NPV</div><span>→</span><div>⑤ Факторы</div></div><div className="help">Проценты не показываются: внешние источники не дают достоверного progress.</div></Card><Card><SectionHeader title="История вычислений" side={`${items.length} запусков`}/>{items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Время</th><th>ID</th><th>Тип</th><th>Этап</th><th>Статус</th><th>Диагностика</th></tr></thead><tbody>{items.map(item => <tr key={item.run_id}><td>{new Date(item.created_at).toLocaleString('ru-RU')}</td><td>{item.run_id.slice(0, 12)}</td><td>{item.type}</td><td>{item.stage}</td><td><StatusBadge status={item.status}/></td><td>{item.error_summary || String(item.result?.valuation_reason || item.result?.cashflow_status || '—')}</td></tr>)}</tbody></table></div> : <EmptyState title="Расчёты ещё не запускались" text="После генерации, денежных потоков или NPV здесь появится история заданий"/>}</Card></>
}

function Logs({smoke}: {smoke?: Record<string, unknown>}) {
  const events = useQuery({queryKey: ['audit-events'], queryFn: () => api<Audit[]>('/audit-events')})
  const issues = useQuery({queryKey: ['validation-issues'], queryFn: () => api<{id: number; code: string; message: string; severity: string; source: string; created_at: string}[]>('/validation-issues')})
  return <><Card><SectionHeader title="Проверки и диагностика" side={smoke ? <StatusBadge status={String(smoke.status)}/> : 'Статус: не запущено'}/><div className="grid three-grid"><div className="diag"><div className="diag-icon">▤</div><strong>Формат сделок</strong><p>Общий серверный валидатор CSV</p><Button>Проверить</Button></div><div className="diag"><div className="diag-icon">⌁</div><strong>Кривые ставок</strong><p>Проверка API и точек</p><Button>Проверить</Button></div><div className="diag"><div className="diag-icon">↗</div><strong>Сквозной тест</strong><p>Потоки → DF → NPV</p><Button>Проверить</Button></div></div></Card><Card><SectionHeader title="Журнал событий" side={`${(events.data?.length || 0) + (issues.data?.length || 0)} записей`}/><div className="filters"><span className="filter-chip">Все источники ⌄</span><span className="filter-chip">Все уровни ⌄</span><span className="search">Поиск по коду, сообщению или ID</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Время</th><th>Модуль</th><th>Уровень</th><th>Код</th><th>Описание</th></tr></thead><tbody>{events.data?.map(item => <tr key={`e${item.id}`}><td>{new Date(item.created_at).toLocaleString('ru-RU')}</td><td>{item.module}</td><td><Badge tone={item.level === 'error' ? 'danger' : 'slate'}>{item.level}</Badge></td><td>{item.code}</td><td>{item.message}</td></tr>)}{issues.data?.map(item => <tr key={`i${item.id}`}><td>{new Date(item.created_at).toLocaleString('ru-RU')}</td><td>{item.source}</td><td><Badge tone={item.severity === 'error' ? 'danger' : 'purple'}>{item.severity}</Badge></td><td>{item.code}</td><td>{item.message}</td></tr>)}{!events.data?.length && !issues.data?.length && <tr><td>—</td><td>Система</td><td><Badge>Информация</Badge></td><td>—</td><td>События пока отсутствуют</td></tr>}</tbody></table></div><div className="note"><b>Диагностика расчётного движка</b><p>Поля исходных ошибок: deal_id, severity, code, field, message. Ошибки импорта и частичные результаты не скрываются.</p></div></Card></>
}
