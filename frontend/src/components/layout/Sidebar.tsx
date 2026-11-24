import { NavLink, useLocation } from 'react-router-dom'
import { Briefcase, ChartSpline, LayoutDashboard, Settings, Sparkles, TrendingUp, Database } from 'lucide-react'
import { cn } from '../../lib/utils'

const nav = [
  {path: '/overview', icon: LayoutDashboard, label: 'Обзор'},
  {path: '/generator', icon: Sparkles, label: 'Генератор сделок'},
  {path: '/portfolios', icon: Briefcase, label: 'Портфель'},
  {path: '/analysis', icon: TrendingUp, label: 'Факторный анализ'},
  {path: '/curves', icon: ChartSpline, label: 'Кривые ставок'},
  {path: '/integrations', icon: Database, label: 'Данные и интеграции'},
]

function Logo() {
  return (
    <NavLink to="/overview" className="flex items-center gap-2.5 px-2 mb-9 select-none">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-lime text-ink">
        <TrendingUp size={20} strokeWidth={2.5} />
      </span>
      <span className="text-[19px] font-bold tracking-[-0.02em]">
        NPV<span className="text-lime">·</span><span className="text-muted font-semibold">Analytics</span>
      </span>
    </NavLink>
  )
}

export function Sidebar() {
  const location = useLocation()
  const isActive = (path: string) => (path === '/overview' ? location.pathname === path : location.pathname.startsWith(path))
  return (
    <aside className="w-[250px] min-w-[250px] bg-sidebar border-r border-border min-h-screen h-screen sticky top-0 flex flex-col px-4 py-6 z-10 max-lg:w-[210px] max-lg:min-w-[210px] max-md:relative max-md:w-full max-md:min-w-0 max-md:h-auto max-md:min-h-0 max-md:border-r-0 max-md:border-b">
      <Logo />
      <div className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase px-3 mb-3 max-md:hidden">Рабочая область</div>
      <nav className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto">
        {nav.map(({path, icon: Icon, label}) => (
          <NavLink
            key={path}
            to={path}
            className={cn(
              'flex items-center gap-3 rounded-full px-4 py-3 text-[13.5px] font-medium whitespace-nowrap transition-all duration-200',
              isActive(path) ? 'bg-lime text-ink font-semibold' : 'text-muted hover:text-foreground hover:bg-white/4',
            )}
          >
            <Icon size={19} strokeWidth={isActive(path) ? 2.2 : 1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 max-md:hidden" />
      <div className="rounded-panel bg-card border border-border p-3.5 mb-3 flex items-center gap-3 max-md:hidden">
        <span className="w-2 h-2 rounded-full bg-lime shadow-[0_0_10px_rgba(198,242,78,0.6)] shrink-0" />
        <div className="min-w-0">
          <strong className="block text-xs font-semibold truncate">Проект · Спринт 03</strong>
          <span className="block text-[11px] text-faint mt-0.5">Команда «пацаны»</span>
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 pt-3 border-t border-border text-muted text-xs max-md:hidden">
        <Settings size={16} strokeWidth={1.8} />
        <span>Настройки отображения</span>
      </div>
    </aside>
  )
}
