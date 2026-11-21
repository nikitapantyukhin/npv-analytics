import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export function PageHeader({crumb, title, description, actions}: {crumb: string; title: string; description: string; actions?: ReactNode}) {
  return <div className="page-heading"><div><div className="crumb">NPV ANALYTICS <span>/</span> {crumb}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>
}

export function Button({children, primary, disabled, onClick, type = 'button', title, className = ''}: {children: ReactNode; primary?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit'; title?: string; className?: string}) {
  return <button type={type} className={`btn ${primary ? 'primary' : ''} ${className}`} disabled={disabled} onClick={onClick} title={title}>{children}</button>
}

export function Card({children, className = ''}: {children: ReactNode; className?: string}) { return <section className={`card ${className}`}>{children}</section> }

export function SectionHeader({title, side}: {title: string; side?: ReactNode}) { return <div className="section-header"><h3>{title}</h3><div className="section-side">{side}</div></div> }

export function KPI({label, value, sub, tone = 'blue', icon, className = ''}: {label: string; value: ReactNode; sub?: ReactNode; tone?: 'blue' | 'green' | 'violet'; icon: string; className?: string}) {
  return <div className={`kpi ${tone} ${className}`}><div className="kpi-line"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>
}

export type Tab = {label: string; to: string; active: boolean}
export function Tabs({items}: {items: Tab[]}) { return <div className="tabs">{items.map(item => <NavLink key={item.to} to={item.to} className={`tab ${item.active ? 'active' : ''}`}>{item.label}</NavLink>)}</div> }

export function Badge({children, tone = 'slate'}: {children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'purple' | 'danger'}) { return <span className={`badge ${tone}`}>{children}</span> }

export function StatusBadge({status}: {status?: string}) {
  const tone = status === 'Работает' || status === 'Доступно' || status === 'succeeded' ? 'green' : status === 'Ожидает интеграции' || status === 'Запланировано' || status === 'partial' ? 'purple' : status === 'failed' || status === 'Ошибка' ? 'danger' : 'slate'
  return <Badge tone={tone}>{status || 'Нет данных'}</Badge>
}

export function LoadingState({label = 'Загрузка данных…'}: {label?: string}) { return <Card><div className="empty-chart"><span className="spinner">◌</span><b>{label}</b></div></Card> }
export function ErrorState({message}: {message: string}) { return <div className="callout error"><span className="alert-icon">!</span><div><strong>Не удалось получить данные</strong><p>{message}</p></div><Badge tone="danger">Ошибка</Badge></div> }
export function EmptyState({title, text, icon = '▣', big = true}: {title: string; text: string; icon?: string; big?: boolean}) { return <div className={`empty-chart ${big ? 'big' : ''}`}><span>{icon}</span><b>{title}</b><p>{text}</p></div> }

export function Field({label, children}: {label: string; children: ReactNode}) { return <label className="field"><span>{label}</span>{children}</label> }
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="native-input" {...props} /> }
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="native-input native-select" {...props} /> }

export function LineChart({values, labels, secondary}: {values: number[]; labels: string[]; secondary?: number[]}) {
  if (!values.length) return <EmptyState title="Нет сопоставимой серии" text="График появится после сохранения достаточного числа фактических расчётов" icon="⌁" />
  const all = secondary ? [...values, ...secondary] : values
  const min = Math.min(...all), max = Math.max(...all), spread = max - min || 1
  const points = values.map((value, index) => `${45 + index * (840 / Math.max(1, values.length - 1))},${220 - ((value - min) / spread) * 150}`).join(' ')
  const second = secondary?.map((value, index) => `${45 + index * (840 / Math.max(1, secondary.length - 1))},${220 - ((value - min) / spread) * 150}`).join(' ')
  return <svg className="line-chart" viewBox="0 0 930 280" preserveAspectRatio="none" aria-label="График"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#438fff" stopOpacity=".28"/><stop offset="1" stopColor="#438fff" stopOpacity="0"/></linearGradient></defs>{[35,80,125,170,215].map(y => <line key={y} x1="40" x2="890" y1={y} y2={y} stroke="#29425f" opacity=".7"/>)}<polygon points={`45,225 ${points} 885,225`} fill="url(#chart-fill)"/><polyline points={points} fill="none" stroke="#58bdff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{second && <polyline points={second} fill="none" stroke="#aa8bf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}{labels.map((label, index) => <text key={`${label}-${index}`} x={45 + index * (840 / Math.max(1, labels.length - 1))} y="270" textAnchor="middle" fontSize="11" fill="#7e92ad">{label}</text>)}</svg>
}

export function Bar({label, value, tone = 'blue'}: {label: string; value: number; tone?: 'blue' | 'purple' | 'mint'}) { return <div className="bar-item"><div className="bar-top"><span>{label}</span><b>{value}%</b></div><div className="bar-track"><div className={`bar-fill ${tone}`} style={{width: `${Math.min(100, Math.max(0, value))}%`}} /></div></div> }
