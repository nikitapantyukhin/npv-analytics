import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Inbox, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Badge } from './badge'
import { Card } from './card'
import { Skeleton } from './skeleton'

export { Badge } from './badge'
export { Button } from './button'
export { Card, CardHeader } from './card'
export { Input, Select } from './input'
export { Skeleton } from './skeleton'

export function PageHeader({crumb, title, description, actions}: {crumb: string; title: string; description: string; actions?: ReactNode}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      <div className="min-w-0">
        <div className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase mb-2">
          NPV Analytics <span className="text-faint/50 mx-1">/</span> {crumb}
        </div>
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] m-0">{title}</h1>
        <p className="text-muted text-[13px] mt-2 mb-0">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  )
}

export function SectionHeader({title, side}: {title: ReactNode; side?: ReactNode}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="text-[15px] font-bold tracking-tight m-0">{title}</h3>
      {side && <div className="text-xs text-muted shrink-0">{side}</div>}
    </div>
  )
}

export function DeltaPill({value, suffix = '%', className}: {value: number; suffix?: string; className?: string}) {
  const positive = value >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tnum',
        positive ? 'bg-green/15 text-green' : 'bg-red/15 text-red',
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.5} />
      {positive ? '+' : '−'}
      {Math.abs(value).toLocaleString('ru-RU', {maximumFractionDigits: 2})} {suffix}
    </span>
  )
}

export function KPI({label, value, sub, icon: Icon, accent, delta}: {label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; accent?: boolean; delta?: number}) {
  if (accent) {
    return (
      <Card accent className="min-h-[124px] flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink/70">{label}</span>
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-ink/10 text-ink"><Icon size={18} strokeWidth={1.8} /></span>
        </div>
        <div className="flex items-end gap-2.5 mt-auto flex-wrap">
          <span className="text-[26px] font-bold tracking-[-0.02em] tnum leading-none">{value}</span>
          {delta != null && <DeltaPill value={delta} className="bg-ink/10 text-ink mb-0.5 [&>svg]:text-ink" />}
        </div>
        {sub && <div className="text-[11px] text-ink/60 mt-2 truncate">{sub}</div>}
      </Card>
    )
  }
  return (
    <Card hover className="min-h-[124px] flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/5 text-lime"><Icon size={18} strokeWidth={1.8} /></span>
      </div>
      <div className="flex items-end gap-2.5 mt-auto flex-wrap">
        <span className="text-[24px] font-bold tracking-[-0.02em] tnum leading-none">{value}</span>
        {delta != null && <DeltaPill value={delta} className="mb-0.5" />}
      </div>
      {sub && <div className="text-[11px] text-faint mt-2 truncate">{sub}</div>}
    </Card>
  )
}

export type TabItem = {label: string; to: string; active: boolean}

export function Tabs({items}: {items: TabItem[]}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-field border border-border p-1 mb-6 max-w-full overflow-x-auto">
      {items.map(item => (
        <Link
          key={item.to}
          to={item.to}
          className={cn(
            'rounded-full px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-all duration-200',
            item.active ? 'bg-lime text-ink' : 'text-muted hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}

export function StatusBadge({status}: {status?: string}) {
  const tone =
    status === 'Работает' || status === 'Доступно' || status === 'succeeded' ? 'lime'
    : status === 'failed' || status === 'Ошибка' || status === 'Недоступно' || status === 'error' ? 'red'
    : status === 'running' || status === 'queued' || status === 'Выполняется' || status === 'Проверяется' ? 'amber'
    : 'slate'
  return <Badge tone={tone}>{status || 'Нет данных'}</Badge>
}

export function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({length: 4}).map((_, index) => <Skeleton key={index} className="h-[124px] rounded-card" />)}
      </div>
      <Skeleton className="h-[320px] rounded-card" />
      <Skeleton className="h-[220px] rounded-card" />
    </div>
  )
}

export function ErrorState({message, onRetry}: {message: string; onRetry?: () => void}) {
  return (
    <Card className="border-red/25">
      <div className="flex items-start gap-4">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-red/12 text-red shrink-0"><AlertCircle size={22} strokeWidth={1.8} /></span>
        <div className="flex-1 min-w-0">
          <strong className="block text-[14px]">Не удалось получить данные</strong>
          <p className="text-muted text-xs leading-relaxed mt-1.5 mb-0 break-words">{message}</p>
          {onRetry && <button onClick={onRetry} className="mt-3 text-xs font-semibold text-lime hover:underline cursor-pointer bg-transparent border-0 p-0">Повторить</button>}
        </div>
        <Badge tone="red">Ошибка</Badge>
      </div>
    </Card>
  )
}

export function EmptyState({title, text, icon: Icon = Inbox, action, compact}: {title: string; text: string; icon?: LucideIcon; action?: ReactNode; compact?: boolean}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center gap-2', compact ? 'min-h-[140px] py-4' : 'min-h-[240px] py-8')}>
      <Icon size={48} strokeWidth={1.2} className="text-faint mb-1" />
      <b className="text-[14px] text-foreground">{title}</b>
      <p className="text-xs text-faint max-w-[420px] leading-relaxed m-0">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Field({label, children, error, className}: {label: string; children: ReactNode; error?: string; className?: string}) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-xs font-medium text-muted mb-2">{label}</span>
      {children}
      {error && <span className="block text-[11px] text-red mt-1.5">{error}</span>}
    </label>
  )
}
