import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { Select } from '../ui'

type IntegrationStatus = {nosnitches: {status: string}; quantum: {status: string}}

function StatusChip({name, status}: {name: string; status?: string}) {
  const ok = status === 'Доступно'
  return (
    <span className="hidden xl:inline-flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1.5 text-[11px] text-muted">
      <span className={cn('w-1.5 h-1.5 rounded-full', ok ? 'bg-lime shadow-[0_0_8px_rgba(198,242,78,0.7)]' : 'bg-amber')} />
      {name}
      <span className="text-faint">{status || 'проверка'}</span>
    </span>
  )
}

export function Topbar() {
  const status = useQuery({queryKey: ['integration-status'], queryFn: () => api<IntegrationStatus>('/integrations/status'), retry: false})
  const portfolios = useQuery({queryKey: ['portfolios'], queryFn: () => api<{id: string; name: string}[]>('/portfolios')})
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname.startsWith('/portfolios/') ? location.pathname.split('/')[2] : ''
  const selected = portfolios.data?.find(portfolio => portfolio.id === current) || portfolios.data?.[0]
  const [search, setSearch] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected) navigate(`/portfolios/${selected.id}?${new URLSearchParams({search: search.trim()})}`)
  }
  return (
    <header className="h-[68px] min-h-[68px] bg-topbar/90 backdrop-blur border-b border-border flex items-center justify-between gap-4 px-7 max-md:px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase max-lg:hidden">Рабочее пространство</span>
        <span className="w-px h-5 bg-border-strong max-lg:hidden" />
        {selected ? <Select aria-label="Открыть портфель" className="max-w-[245px] text-xs" value={current || ''} onChange={event => navigate(`/portfolios/${event.target.value}`)}>
          <option value="" disabled>Открыть портфель</option>
          {portfolios.data?.map(portfolio => <option value={portfolio.id} key={portfolio.id}>{portfolio.name}</option>)}
        </Select> : <Link className="text-lime text-xs" to="/generator">Создать портфель</Link>}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <StatusChip name="nosnitches" status={status.data?.nosnitches.status} />
        <StatusChip name="QuantumTeam" status={status.data?.quantum.status} />
        {selected && <form onSubmit={submit} className="hidden md:flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 w-[220px] focus-within:border-lime transition-all">
          <input aria-label="Поиск сделки в портфеле" placeholder="Поиск сделки…" value={search} onChange={event => setSearch(event.target.value)} className="bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-faint w-full" />
          <button type="submit" aria-label="Найти сделку" className="text-faint hover:text-lime cursor-pointer"><Search size={14} /></button>
        </form>}
        <span className="grid place-items-center w-9 h-9 rounded-full bg-lime/15 border border-lime/30 text-lime text-xs font-bold">П</span>
      </div>
    </header>
  )
}
