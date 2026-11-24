import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ArrowUpRight, ChartSpline, Download, Hash, Layers, Play, TrendingUp, Wallet } from 'lucide-react'
import { api, formatCount, formatDate, formatMoney, formatPercentFromDecimal } from '../lib/api'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, KPI, LoadingState, PageHeader, SectionHeader, Select, StatusBadge, Tabs } from '../components/ui'
import { cn } from '../lib/utils'

type PortfolioList = {id: string; name: string; version: {deal_count: number; credit_count: number; deposit_count: number; valuation_date: string}; last_run?: Run}
type Run = {run_id: string; status: string; result?: Record<string, unknown>}
type PortfolioDetail = {id: string; name: string; version: {id: string; valuation_date: string}; stats: {kind: string; count: number; principal: string}[]; runs: Run[]}
type Deal = {id: string; deal_id: string; kind: string; discriminator: string; rate_type: string; principal: string; interest_rate: string; maturity_date: string; validation_status: string}

const columnHelper = createColumnHelper<Deal>()

export function PortfolioPage() {
  const {portfolioId} = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tab = params.get('tab') || 'deals'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [snapshot, setSnapshot] = useState('')
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<PortfolioList[]>('/portfolios')})
  const selectedId = portfolioId || portfolios.data?.[0]?.id
  const detail = useQuery({queryKey: ['portfolio', selectedId], queryFn: () => api<PortfolioDetail>(`/portfolios/${selectedId}`), enabled: !!selectedId})
  const deals = useQuery({queryKey: ['deals', selectedId, search], queryFn: () => api<{items: Deal[]; total: number; pages: number}>(`/portfolios/${selectedId}/deals?page_size=25&search=${encodeURIComponent(search)}`), enabled: !!selectedId && tab === 'deals'})
  const curves = useQuery({queryKey: ['curves'], queryFn: () => api<{id: string; source: string; trade_date: string}[]>('/curves')})
  const calculation = useMutation({mutationFn: () => api<Run>(`/portfolios/${selectedId}/calculate`, {method: 'POST', body: JSON.stringify({snapshot_id: snapshot || null})}), onSuccess: async () => {await queryClient.invalidateQueries({queryKey: ['portfolio', selectedId]}); await queryClient.invalidateQueries({queryKey: ['runs']})}})

  const table = useReactTable({
    data: deals.data?.items || [],
    columns: [
      columnHelper.accessor('deal_id', {
        header: 'ID сделки',
        cell: info => <Link className="text-lime font-semibold hover:underline" to={`/portfolios/${selectedId}/deals/${info.row.original.id}`}>{info.getValue()}</Link>,
      }),
      columnHelper.accessor('kind', {
        header: 'Тип',
        cell: info => <Badge tone={info.getValue() === 'credit' ? 'lime' : 'slate'}>{info.getValue() === 'credit' ? 'Кредит' : 'Депозит'}</Badge>,
      }),
      columnHelper.accessor('principal', {header: 'Остаток', cell: info => <span className="tnum">{formatMoney(Math.abs(Number(info.getValue())))}</span>}),
      columnHelper.accessor('maturity_date', {header: 'Погашение', cell: info => formatDate(info.getValue())}),
      columnHelper.accessor('interest_rate', {
        header: 'Ставка',
        cell: info => <span className="tnum">{info.row.original.rate_type === 'FLOAT' ? `CBKEY1M + ${formatPercentFromDecimal(info.getValue())}` : formatPercentFromDecimal(info.getValue())}</span>,
      }),
      columnHelper.accessor('discriminator', {header: 'График'}),
      columnHelper.accessor('validation_status', {
        header: 'Валидация',
        cell: info => <StatusBadge status={info.getValue() === 'valid' ? 'Доступно' : info.getValue()} />,
      }),
      columnHelper.display({
        id: 'open',
        cell: info => (
          <Link to={`/portfolios/${selectedId}/deals/${info.row.original.id}`} className="text-faint hover:text-lime transition-colors">
            <ArrowUpRight size={16} />
          </Link>
        ),
      }),
    ],
    getCoreRowModel: getCoreRowModel(),
  })

  if (portfolios.isLoading) return <LoadingState />
  if (portfolios.error) return <ErrorState message={(portfolios.error as Error).message} />
  if (!selectedId) {
    return (
      <>
        <PageHeader crumb="ПОРТФЕЛЬ" title="Портфель" description="Реестр кредитных и депозитных сделок, расчёты и финансовые показатели" />
        <Card>
          <EmptyState
            icon={Wallet}
            title="Портфелей пока нет"
            text="Создайте воспроизводимый портфель в генераторе"
            action={<Link to="/generator"><Button variant="primary">Открыть генератор</Button></Link>}
          />
        </Card>
      </>
    )
  }
  if (detail.isLoading) return <LoadingState />
  if (detail.error) return <ErrorState message={(detail.error as Error).message} />
  const data = detail.data!
  const credit = data.stats.find(item => item.kind === 'credit')
  const deposit = data.stats.find(item => item.kind === 'deposit')
  const last = data.runs.find(run => run.result?.npv)
  const tabItems = [{key: 'deals', label: 'Сделки'}, {key: 'cashflows', label: 'Денежные потоки'}, {key: 'structure', label: 'Структура'}, {key: 'runs', label: 'История расчётов'}]
  return (
    <>
      <PageHeader
        crumb="ПОРТФЕЛЬ"
        title="Портфель"
        description="Реестр кредитных и депозитных сделок, расчёты и финансовые показатели"
        actions={
          <>
            <a href={`/api/portfolios/${selectedId}/export`}><Button variant="secondary"><Download size={15} /> Экспорт CSV</Button></a>
            <Button variant="primary" size="lg" onClick={() => calculation.mutate()} disabled={calculation.isPending} title={!snapshot ? 'Без снимка будут рассчитаны только денежные потоки' : undefined}>
              <Play size={15} strokeWidth={2.4} /> {calculation.isPending ? 'Расчёт…' : 'Рассчитать портфель'}
            </Button>
          </>
        }
      />
      {calculation.error && <div className="mb-5"><ErrorState message={(calculation.error as Error).message} /></div>}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="min-w-[230px]">
          <Select value={selectedId} onChange={event => navigate(`/portfolios/${event.target.value}`)}>
            {portfolios.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 text-[11.5px] text-muted">Дата оценки <strong className="text-foreground">{formatDate(data.version.valuation_date)}</strong></span>
        <div className="min-w-[250px]">
          <Select value={snapshot} onChange={event => setSnapshot(event.target.value)}>
            <option value="">CF без NPV · снимок не выбран</option>
            {curves.data?.map(item => <option value={item.id} key={item.id}>{item.trade_date} · {item.source}</option>)}
          </Select>
        </div>
        <StatusBadge status={data.runs[0]?.status || 'Ожидает расчёта'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KPI icon={Hash} label="Всего сделок" value={formatCount((credit?.count || 0) + (deposit?.count || 0))} sub={`Кредиты: ${formatCount(credit?.count)} · депозиты: ${formatCount(deposit?.count)}`} />
        <KPI icon={Layers} label="Кредитные остатки" value={formatMoney(credit?.principal)} sub="Активы банка" />
        <KPI icon={Wallet} label="Депозитные остатки" value={formatMoney(deposit ? Math.abs(Number(deposit.principal)) : null)} sub="Обязательства банка · по модулю" />
        <KPI accent icon={TrendingUp} label="NPV портфеля" value={last?.result?.npv ? formatMoney(String(last.result.npv)) : '—'} sub={last ? `Запуск ${last.run_id.slice(0, 8)}` : 'Нужны полные CF и DF'} />
      </div>
      <Tabs items={tabItems.map(item => ({label: item.label, to: `/portfolios/${selectedId}${item.key === 'deals' ? '' : `?tab=${item.key}`}`, active: tab === item.key}))} />
      {tab === 'deals' && (
        <Card>
          <CardHeader title="Реестр сделок" side={`${formatCount(deals.data?.total)} записей`} />
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по ID или продукту…" />
            </div>
            {['Тип сделки', 'Ставка', 'График', 'Статус'].map(filter => (
              <span key={filter} className="inline-flex items-center gap-1.5 rounded-full bg-card2 border border-border px-3.5 py-2 text-[11.5px] text-muted">{filter}</span>
            ))}
          </div>
          {deals.isLoading ? <LoadingState /> : (
            <div className="overflow-auto -mx-1 px-1">
              <table className="w-full border-collapse text-left whitespace-nowrap">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-white/3 transition-colors cursor-pointer" onClick={() => navigate(`/portfolios/${selectedId}/deals/${row.original.id}`)}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="border-b border-border px-3 py-3 text-[12.5px] text-foreground/90">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between text-[11.5px] text-faint mt-4">
            <span>Показано {deals.data?.items.length || 0} из {formatCount(deals.data?.total)}</span>
            <span className="flex items-center gap-2">Страница <b className="text-ink bg-lime rounded-md px-2 py-0.5 text-[11px]">1</b> из {deals.data?.pages || 1}</span>
          </div>
        </Card>
      )}
      {tab === 'cashflows' && (
        <Card>
          <CardHeader title="Денежные потоки портфеля" />
          <EmptyState
            icon={ChartSpline}
            title={data.runs.some(run => Number(run.result?.cashflow_event_count) > 0) ? 'Потоки сохранены по сделкам' : 'Денежные потоки ещё не рассчитаны'}
            text="Откройте карточку сделки для исходных событий cfgen или запустите расчёт портфеля"
          />
        </Card>
      )}
      {tab === 'structure' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Инструменты" />
            {[{label: 'Кредиты', count: credit?.count || 0}, {label: 'Депозиты', count: deposit?.count || 0}].map(row => (
              <div key={row.label} className="flex justify-between py-3 border-b border-border last:border-0 text-[12.5px]">
                <span className="text-muted">{row.label}</span>
                <b className="tnum">{formatCount(row.count)}</b>
              </div>
            ))}
          </Card>
          <Card>
            <CardHeader title="Версия данных" />
            <div className="flex justify-between py-3 border-b border-border text-[12.5px]"><span className="text-muted">ID версии</span><b className="tnum truncate max-w-[320px]">{data.version.id}</b></div>
            <div className="flex justify-between py-3 text-[12.5px]"><span className="text-muted">Дата оценки</span><b>{formatDate(data.version.valuation_date)}</b></div>
          </Card>
        </div>
      )}
      {tab === 'runs' && (
        <Card>
          <CardHeader title="История расчётов" side={`${data.runs.length} запусков`} />
          {data.runs.length ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>{['ID', 'Статус', 'Результат'].map(head => <th key={head} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint border-b border-border px-3 py-3">{head}</th>)}</tr>
              </thead>
              <tbody>
                {data.runs.map(run => (
                  <tr key={run.run_id} className="hover:bg-white/3 transition-colors">
                    <td className="border-b border-border px-3 py-3 text-[12px] text-muted tnum">{run.run_id}</td>
                    <td className="border-b border-border px-3 py-3"><StatusBadge status={run.status} /></td>
                    <td className="border-b border-border px-3 py-3 text-[12.5px] tnum">{run.result?.npv ? formatMoney(String(run.result.npv)) : String(run.result?.valuation_reason || run.result?.cashflow_status || '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Расчётов ещё нет" text="Старые результаты не перезаписываются — каждый запуск появится здесь" />
          )}
        </Card>
      )}
    </>
  )
}
