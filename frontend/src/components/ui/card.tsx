import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Card({className, accent, hover, ...props}: HTMLAttributes<HTMLElement> & {accent?: boolean; hover?: boolean}) {
  if (accent) {
    return <section className={cn('rounded-card bg-lime text-ink p-5 md:p-6 min-w-0', hover && 'card-hover', className)} {...props} />
  }
  return (
    <section
      className={cn(
        'rounded-card bg-card border border-border p-5 md:p-6 min-w-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        hover && 'card-hover',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({title, side, accent}: {title: ReactNode; side?: ReactNode; accent?: boolean}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className={cn('text-[15px] font-bold tracking-tight m-0', accent ? 'text-ink' : 'text-foreground')}>{title}</h3>
      {side && <div className={cn('text-xs shrink-0', accent ? 'text-ink/60' : 'text-muted')}>{side}</div>}
    </div>
  )
}
