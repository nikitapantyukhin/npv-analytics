import { NavLink, Outlet, useLocation } from 'react-router-dom'

const nav = [
  ['/overview', '▣', 'Обзор'], ['/generator', '◇', 'Генератор'], ['/portfolios', '▤', 'Портфель'],
  ['/analysis', '▥', 'Факторный анализ'], ['/curves', '⌁', 'Кривые ставок'], ['/integrations', '⛓', 'Данные и интеграции'],
]

export function Layout() {
  const location = useLocation()
  const isActive = (path: string) => path === '/overview' ? location.pathname === path : location.pathname.startsWith(path)
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/overview" className="brand"><span className="brand-mark">⌁</span><span>NPV <b>Analytics</b></span></NavLink>
      <div className="side-label">РАБОЧАЯ ОБЛАСТЬ</div>
      <nav>{nav.map(([path, icon, label]) => <NavLink key={path} to={path} className={`nav-item ${isActive(path) ? 'active' : ''}`}><span className="nav-icon">{icon}</span><span>{label}</span></NavLink>)}</nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left"><span className="top-brand">РАБОЧЕЕ ПРОСТРАНСТВО</span><span className="top-divider" /><span>Портфель:</span><span className="top-portfolio">Текущий сохранённый портфель <span>⌄</span></span></div>
      </header>
      <main className="main"><Outlet /></main>
      <footer className="footline">NPV ANALYTICS <span>·</span> СПРИНТ 03 <span>·</span> Результаты только из backend; учебные источники маркируются</footer>
    </div>
  </div>
}
