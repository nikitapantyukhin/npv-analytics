import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

const nav = [
  ['/overview', '▣', 'Обзор'], ['/generator', '◇', 'Генератор сделок'], ['/portfolios', '▤', 'Портфель'],
  ['/analysis', '▥', 'Факторный анализ'], ['/curves', '⌁', 'Кривые ставок'], ['/integrations', '⛓', 'Данные и интеграции'],
]

type IntegrationStatus = {nosnitches: {status: string}; quantum: {status: string}}

export function Layout() {
  const location = useLocation()
  const status = useQuery({queryKey: ['integration-status'], queryFn: () => api<IntegrationStatus>('/integrations/status'), retry: false})
  const isActive = (path: string) => path === '/overview' ? location.pathname === path : location.pathname.startsWith(path)
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/overview" className="brand"><span className="brand-mark">⌁</span><span>NPV <b>Analytics</b></span></NavLink>
      <div className="side-label">РАБОЧАЯ ОБЛАСТЬ</div>
      <nav>{nav.map(([path, icon, label]) => <NavLink key={path} to={path} className={`nav-item ${isActive(path) ? 'active' : ''}`}><span className="nav-icon">{icon}</span><span>{label}</span></NavLink>)}</nav>
      <div className="side-spacer" />
      <div className="sidebar-panel"><span className="sp-dot" /><div><strong>Проект · Спринт 03</strong><span>Команда «пацаны»</span></div></div>
      <div className="sidebar-foot"><span>⚙</span><span>Настройки отображения</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left"><span className="top-brand">РАБОЧЕЕ ПРОСТРАНСТВО</span><span className="top-divider" /><span>Портфель:</span><span className="top-portfolio">Текущий сохранённый портфель <span>⌄</span></span></div>
        <div className="topbar-right">
          <span className="top-status"><i className={status.data?.nosnitches.status === 'Доступно' ? 'ok-dot' : 'warn-dot'} /> nosnitches <span>{status.data?.nosnitches.status || 'проверка'}</span></span>
          <span className="top-status"><i className={status.data?.quantum.status === 'Доступно' ? 'ok-dot' : 'warn-dot'} /> QuantumTeam <span>{status.data?.quantum.status || 'проверка'}</span></span>
          <span className="live-badge">РАБОЧАЯ СИСТЕМА</span><span className="avatar">П</span>
        </div>
      </header>
      <main className="main"><Outlet /></main>
      <footer className="footline">NPV ANALYTICS <span>·</span> СПРИНТ 03 <span>·</span> Результаты только из backend; учебные источники маркируются</footer>
    </div>
  </div>
}
