import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import OverviewPage from './pages/Overview'
import MapPage from './pages/Map'
import AlertsPage from './pages/Alerts'
import ExplorePage from './pages/Explore'
import HealthPage from './pages/Health'
import SettingsPage from './pages/Settings'

const navItems = [
  { path: '/',        label: 'Overview', icon: 'dashboard' },
  { path: '/map',     label: 'Map',      icon: 'map' },
  { path: '/alerts',  label: 'Alerts',   icon: 'warning' },
  { path: '/explore', label: 'Explore',  icon: 'search' },
  { path: '/health',  label: 'Health',   icon: 'monitor_heart' },
  { path: '/settings',label: 'Settings', icon: 'settings' },
]

function MaterialIcon({ name, filled = false, className = '' }: { name: string; filled?: boolean; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
    >
      {name}
    </span>
  )
}

function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="fixed left-0 top-0 h-full w-64 z-40 bg-[#121820]/80 backdrop-blur-xl shadow-[4px_0_24px_rgba(0,0,0,0.5)] flex flex-col pt-0 pb-8 px-4">
      {/* Kermit Logo Full Width Header */}
      <div className="h-[76px] -mx-4 flex items-center justify-center border-b border-white/5 mb-8 bg-[#0a0e14]/40">
        <img src="/kermit-logo.svg" alt="Kermit Logo" className="w-[180px] h-auto object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]" />
      </div>

      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#151a21] flex items-center justify-center border border-[#99f7ff]/20">
          <MaterialIcon name="terminal" className="text-[#99f7ff]" />
        </div>
        <div>
          <h2 className="text-[#99f7ff] font-headline font-black text-sm tracking-widest uppercase">HTAP COMMAND</h2>
          <p className="text-[10px] text-[#99f7ff]/60 tracking-[0.2em] font-medium uppercase">SYSTEM ACTIVE</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-3 transition-all duration-300 hover:translate-x-1 ${
                isActive
                  ? 'bg-gradient-to-r from-[#99f7ff]/20 to-transparent text-[#99f7ff] border-l-4 border-[#99f7ff]'
                  : 'text-slate-500 opacity-70 hover:opacity-100 hover:bg-white/5'
              }`}
            >
              <MaterialIcon name={item.icon} filled={isActive} />
              <span className="font-label text-[0.6875rem] uppercase tracking-[0.1em] font-medium">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto pt-6 space-y-1 border-t border-white/5">
        {/* DEPLOY ASSET — now navigates to Settings to trigger a scenario */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full mb-6 py-3 bg-[#99f7ff] text-[#005f64] font-headline font-bold text-[0.6875rem] tracking-[0.15em] hover:brightness-110 active:scale-95 transition-all cursor-pointer rounded-sm flex items-center justify-center gap-2"
        >
          <MaterialIcon name="rocket_launch" className="text-[16px]" />
          DEPLOY ASSET
        </button>
        {/* Logs → Explore page */}
        <NavLink
          to="/explore"
          className="flex items-center gap-4 px-4 py-2 text-slate-500 opacity-70 hover:opacity-100 transition-all duration-300"
        >
          <MaterialIcon name="history" />
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.1em] font-medium">Logs</span>
        </NavLink>
        {/* Support → Health page */}
        <NavLink
          to="/health"
          className="flex items-center gap-4 px-4 py-2 text-slate-500 opacity-70 hover:opacity-100 transition-all duration-300"
        >
          <MaterialIcon name="help" />
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.1em] font-medium">Support</span>
        </NavLink>
      </div>
    </aside>
  )
}

// ──────────────────────── Latency Compass ────────────────────────
function LatencyCompass() {
  const { data } = useQuery({
    queryKey: ['latency'],
    queryFn: () => fetch('/api/demo/latency').then((r) => r.json()),
    refetchInterval: 8000,
  })

  const metrics = [
    { label: 'Write', value: data?.cassandra_write_ms, unit: 'ms', color: '#99f7ff', title: 'Cassandra OLTP' },
    { label: 'Query', value: data?.trino_query_ms,     unit: 'ms', color: '#feaa00', title: 'Presto OLAP' },
    { label: 'Vector', value: data?.vector_search_ms,  unit: 'ms', color: '#c084fc', title: 'ANN Search' },
  ]

  return (
    <div className="flex items-center gap-1 bg-[#0f141a] border border-white/5 rounded-full px-3 py-1.5">
      {metrics.map((m, i) => (
        <div key={m.label} className="flex items-center gap-2">
          {i > 0 && <span className="w-px h-4 bg-white/10 mx-1" />}
          <div className="flex flex-col items-center" title={m.title}>
            <span className="text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: m.value ? m.color : '#44484f' }}>{m.label}</span>
            <span className="text-[11px] font-headline font-black leading-none" style={{ color: m.value ? m.color : '#44484f' }}>
              {m.value != null ? `${m.value.toFixed(0)}ms` : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TopBar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0E14]/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,241,254,0.08)] flex justify-between items-center px-8 py-4 ml-64">
      <div className="flex items-center gap-8">
        <span className="text-2xl font-bold tracking-[0.2em] text-[#99f7ff] uppercase font-headline">MISSION CONTROL</span>
      </div>
      <div className="flex items-center gap-4">
        {/* Latency Compass */}
        <LatencyCompass />

        <div className="bg-[#151a21] rounded-full px-4 py-1.5 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors">
          <MaterialIcon name="search" className="text-[#99f7ff] text-[18px]" />
          <span className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-wider">Search Stream...</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer active:scale-95 duration-200 relative">
            <MaterialIcon name="notifications" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#ff7162] rounded-full" />
          </button>
          <button className="p-2 text-[#99f7ff] hover:bg-white/5 transition-colors cursor-pointer active:scale-95 duration-200">
            <MaterialIcon name="account_circle" />
          </button>
        </div>
      </div>
    </header>
  )
}

function FloatingStatus() {
  const { data } = useQuery({
    queryKey: ['health'],  // shared with HealthPage — no duplicate request
    queryFn: () => fetch('/api/health').then((r) => r.json()),
    refetchInterval: 5000,
  })

  return (
    <div className="fixed bottom-8 right-8 z-50 flex items-center gap-4 bg-[#20262f] p-4 rounded-xl border border-[#99f7ff]/20 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col items-end">
        <span className="text-[10px] font-black text-[#99f7ff] uppercase tracking-[0.2em]">Live Connection</span>
        <span className="text-[8px] font-medium text-[#a8abb3] uppercase tracking-widest">
          {data?.status === 'ok' ? 'Connected' : 'Connecting...'}
        </span>
      </div>
      <div className="w-12 h-12 bg-[#151a21] rounded-lg flex items-center justify-center relative">
        <MaterialIcon name="cell_tower" className="text-[#99f7ff]" />
        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#20262f] ${
          data?.status === 'ok' ? 'bg-[#99f7ff] animate-pulse' : 'bg-[#ff7162] animate-ping'
        }`} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-[#0a0e14] text-[#f1f3fc] min-h-screen selection:bg-[#99f7ff] selection:text-[#005f64]">
        <TopBar />
        <Sidebar />
        <main className="ml-64 pt-24 px-8 pb-12">
          <div className="max-w-[1600px] mx-auto space-y-8">
            <Routes>
              <Route path="/"        element={<OverviewPage />} />
              <Route path="/map"     element={<MapPage />} />
              <Route path="/alerts"  element={<AlertsPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/health"  element={<HealthPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
        <FloatingStatus />
      </div>
    </BrowserRouter>
  )
}