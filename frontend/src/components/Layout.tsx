import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Sidebar } from './layout/Sidebar'
import { Topbar } from './layout/Topbar'

export function Layout() {
  return (
    <div className="flex min-h-screen max-md:flex-col">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0 px-7 py-7 max-md:px-4 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
        <footer className="px-7 pb-4 text-[9px] font-bold tracking-[0.12em] text-faint/60 uppercase max-md:px-4">
          NPV Analytics · Спринт 03 · Результаты только из backend; учебные источники маркируются
        </footer>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {background: '#1D1D1D', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F5F5'},
        }}
      />
    </div>
  )
}
