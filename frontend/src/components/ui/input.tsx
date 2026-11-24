import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

const fieldClass =
  'w-full h-10 rounded-xl bg-field border border-border px-3.5 text-[13px] text-foreground outline-none transition-all duration-200 placeholder:text-faint focus:border-lime focus:shadow-lime-glow disabled:opacity-50 disabled:cursor-not-allowed'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({className, ...props}, ref) => (
  <input ref={ref} className={cn(fieldClass, className)} {...props} />
))
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({className, children, ...props}, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(fieldClass, 'appearance-none pr-9 cursor-pointer [&>option]:bg-card2', className)} {...props}>
      {children}
    </select>
    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
  </div>
))
Select.displayName = 'Select'
