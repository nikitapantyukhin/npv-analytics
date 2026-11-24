import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-lime-glow',
  {
    variants: {
      variant: {
        primary: 'bg-lime text-ink hover:bg-lime-deep active:scale-[0.98]',
        secondary: 'bg-[#242424] text-foreground border border-border-strong hover:border-lime/40 hover:text-lime',
        ghost: 'text-muted hover:text-foreground hover:bg-white/5',
        danger: 'bg-red/15 text-red border border-red/30 hover:bg-red/25',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {variant: 'secondary', size: 'md'},
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({className, variant, size, ...props}, ref) => (
  <button ref={ref} className={cn(buttonVariants({variant, size}), className)} {...props} />
))
Button.displayName = 'Button'
