import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'

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
  return (
    <header className="h-[68px] min-h-[68px] bg-topbar/90 backdrop-blur border-b border-border flex items-center justify-between gap-4 px-7 max-md:px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase max-lg:hidden">Рабочее пространство</span>
        <span className="w-px h-5 bg-border-strong max-lg:hidden" />
        <button className="flex items-center gap-2 rounded-full bg-card border border-border pl-3.5 pr-3 py-2 text-[12.5px] text-foreground cursor-pointer hover:border-border-strong transition-colors max-w-[280px]">
          <span className="truncate">Текущий сохранённый портфель</span>
          <ChevronDown size={14} className="text-faint shrink-0" />
        </button>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <StatusChip name="nosnitches" status={status.data?.nosnitches.status} />
        <StatusChip name="QuantumTeam" status={status.data?.quantum.status} />
        <label className="hidden md:flex items-center gap-2 rounded-full bg-card border border-border px-3.5 py-2 w-[220px] cursor-text focus-within:border-lime focus-within:shadow-lime-glow transition-all">
          <Search size={14} className="text-faint shrink-0" />
          <input placeholder="Поиск…" className="bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-faint w-full" />
        </label>
        <span className="grid place-items-center w-9 h-9 rounded-full bg-lime/15 border border-lime/30 text-lime text-xs font-bold">П</span>
      </div>
    </header>
  )
}
