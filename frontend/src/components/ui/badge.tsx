import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      lime: 'bg-lime/12 text-lime',
      green: 'bg-green/12 text-green',
      red: 'bg-red/12 text-red',
      amber: 'bg-amber/12 text-amber',
      slate: 'bg-white/6 text-muted',
      outline: 'border border-border-strong text-muted',
      solid: 'bg-lime text-ink',
    },
  },
  defaultVariants: {tone: 'slate'},
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({className, tone, ...props}: BadgeProps) {
  return <span className={cn(badgeVariants({tone}), className)} {...props} />
}
