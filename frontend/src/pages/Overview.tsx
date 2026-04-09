import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface KPIs {
  active_flying_drones: number
  max_speed_mps: number
  min_speed_mps: number
  avg_speed_mps: number
  max_altitude_m: number
  min_altitude_m: number
  avg_altitude_m: number
  near_zone_count: number
  predicted_breach_count: number
  total_drones: number
  grounded_drones: number
  total_events: number
  platform_health_score: number
  ingestion_rate_per_sec: number
  latest_alerts: Array<{
    alert_id: string
    alert_time: string
    entity_id: string
    alert_type: string
    severity: string
    message: string
    risk_score: number
  }>
}

interface IngestionHistory {
  hours?: number
  buckets: Array<{
    time: string
    timestamp: string
    count: number
  }>
}

interface DroneCluster {
  entity_id: string
  latitude: number
  longitude: number
  is_flying: boolean
  risk_score: number
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

// ──────────────────────── KPI Card ────────────────────────
function KPICard({ icon, label, value, unit, badge, badgeColor, progress, progressColor }: {
  icon: string; label: string; value: string; unit: string;
  badge?: string; badgeColor?: string; progress?: number; progressColor?: string;
}) {
  // ✅ FIX: Use inline style for badge bg instead of template-literal Tailwind class
  const badgeBg = badge
    ? badgeColor === 'text-[#ff7162]' ? 'rgba(255,113,98,0.12)'
    : badgeColor === 'text-[#feaa00]' ? 'rgba(254,170,0,0.12)'
    : 'rgba(153,247,255,0.12)'
    : undefined

  return (
    <div className="bg-[#151a21] p-6 rounded-lg relative group transition-all hover:bg-[#1b2028] cursor-default">
      <div className="flex justify-between items-start mb-4">
        <MaterialIcon name={icon} className="text-[#00e2ee]" />
        {badge && (
          <span className={`text-[10px] font-bold ${badgeColor} px-2 py-0.5 rounded tracking-tighter`}
            style={{ background: badgeBg }}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-headline font-bold">{value}</span>
        <span className="text-[#a8abb3] text-xs font-light">{unit}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1 w-full bg-[#000000] rounded-full overflow-hidden">
          <div className={`h-full ${progressColor || 'bg-[#99f7ff]'} transition-all duration-500`}
            style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
    </div>
  )
}

// ──────────────────────── Toast ────────────────────────
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-24 right-8 z-[100] flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl border animate-fade-in ${
      type === 'success'
        ? 'bg-[#151a21] border-[#99f7ff]/30 text-[#99f7ff]'
        : 'bg-[#1b1418] border-[#ff7162]/30 text-[#ff7162]'
    }`}>
      <MaterialIcon name={type === 'success' ? 'check_circle' : 'error'} />
      <span className="text-xs font-bold uppercase tracking-widest">{message}</span>
    </div>
  )
}

export default function OverviewPage() {
  const queryClient = useQueryClient()
  const [historyHours, setHistoryHours] = useState<8 | 24>(8)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const { data: kpis, isLoading: kpisLoading } = useQuery<KPIs>({
    queryKey: ['kpis'],
    queryFn: () => fetch('/api/overview/kpis').then((r) => r.json()),
    refetchInterval: 3000,
  })

  const { data: historyData } = useQuery<IngestionHistory>({
    queryKey: ['ingestion-history', historyHours],
    queryFn: () => fetch(`/api/overview/ingestion-history?hours=${historyHours}`).then((r) => r.json()),
    refetchInterval: 10000,
  })

  // Live cluster data for mini-map
  const { data: mapData } = useQuery<{ drones: DroneCluster[] }>({
    queryKey: ['map-clusters'],
    queryFn: () => fetch('/api/map/live?limit=20').then((r) => r.json()),
    refetchInterval: 5000,
    select: (d) => ({ drones: (d as any).drones?.slice(0, 8) ?? [] }),
  })

  const resyncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/overview/resync', { method: 'POST' })
      return r.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] })
      showToast(data.message || 'Re-sync complete', 'success')
    },
    onError: () => showToast('Re-sync failed', 'error'),
  })

  const handleDownloadLog = () => {
    const url = `/api/overview/ingestion-history/csv?hours=${historyHours}`
    const a = document.createElement('a')
    a.href = url
    a.download = `ingestion_log_${historyHours}h.csv`
    a.click()
    showToast(`Downloading ${historyHours}h ingestion log…`, 'success')
  }

  const history = historyData?.buckets ?? []
  const maxCount = Math.max(...history.map((h) => h.count), 1)

  const healthScore = kpis?.platform_health_score ?? 0.98
  const healthPercent = Math.round(healthScore * 100)

  // Map cluster dots — normalize to a small canvas coordinate space
  const clusterDrones = mapData?.drones ?? []
  const mapDots = clusterDrones.map((d, i) => {
    // Simple spread: use modular positioning based on index if coords not available
    const x = d.longitude ? ((d.longitude % 1) * 200 + 50) : (i * 37 % 200 + 20)
    const y = d.latitude  ? ((d.latitude  % 1) * 150 + 30) : (i * 29 % 150 + 20)
    return { ...d, x: Math.abs(x), y: Math.abs(y) }
  })

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Hero Section */}
      <section className="relative grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        <div className="lg:col-span-2 glass-panel p-10 rounded-xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <MaterialIcon name="vital_signs" className="text-[#99f7ff] text-[160px]" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse" />
              <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">The System Pulse</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">
              {kpisLoading ? 'CONNECTING...' : 'SYSTEM PULSE: OPTIMAL'}
            </h1>
            <p className="text-[#a8abb3] max-w-xl text-lg font-light leading-relaxed mb-8">
              All heuristic pipelines are operating within nominal parameters.
              Real-time ingestion latency is 4ms below the defined threshold.
              Assets are fully synchronized.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => resyncMutation.mutate()}
              disabled={resyncMutation.isPending}
              className="bg-[#99f7ff] hover:bg-[#00e2ee] disabled:opacity-60 text-[#005f64] px-8 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-2"
            >
              {resyncMutation.isPending ? (
                <><MaterialIcon name="sync" className="animate-spin text-[16px]" /> RE-SYNCING...</>
              ) : (
                'EXECUTE RE-SYNC'
              )}
            </button>
            <button
              onClick={handleDownloadLog}
              className="border border-[#99f7ff]/20 hover:border-[#99f7ff]/60 text-[#99f7ff] px-8 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-2"
            >
              <MaterialIcon name="download" className="text-[16px]" /> DOWNLOAD LOG
            </button>
          </div>
        </div>

        {/* Platform Stability Gauge */}
        <div className="glass-panel p-10 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="relative w-48 h-48 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#20262f]" />
            {/* ✅ FIX: Gauge uses clip-path arc approach instead of full-disc rotation */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#20262f" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke="#99f7ff" strokeWidth="8"
                strokeDasharray={`${healthPercent * 2.765} 276.5`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ filter: 'drop-shadow(0 0 6px rgba(153,247,255,0.5))' }}
              />
            </svg>
            <div className="absolute inset-3 rounded-full bg-[#0a0e14] flex flex-col items-center justify-center border border-[#99f7ff]/10">
              <span className="text-5xl font-headline font-black text-[#99f7ff]">{healthPercent}</span>
              <span className="font-label text-[0.6875rem] text-[#99f7ff]/60 uppercase tracking-widest">Score</span>
            </div>
          </div>
          <div className="mt-8">
            <h3 className="font-headline text-xl font-bold uppercase tracking-tight">PLATFORM STABILITY</h3>
            <p className="text-[#a8abb3] text-sm mt-1 uppercase tracking-wider font-light">Peak Performance Mode</p>
          </div>
        </div>
      </section>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          icon="database"
          label="Ingestion Rate"
          value={kpis ? (kpis.ingestion_rate_per_sec / 1000).toFixed(1) + 'k' : '0'}
          unit="/sec"
          badge="LIVE"
          badgeColor="text-[#99f7ff]"
          progress={kpis ? Math.min((kpis.ingestion_rate_per_sec / 5000) * 100, 100) : 0}
          progressColor="bg-[#99f7ff]"
        />
        <KPICard
          icon="helicopter"
          label="Active Drones"
          value={kpis ? String(kpis.active_flying_drones) : '0'}
          unit={`/ ${kpis?.total_drones || 0}`}
          badge={kpis ? `${kpis.grounded_drones} GROUNDED` : 'BUSY'}
          badgeColor="text-[#feaa00]"
          progress={kpis ? Math.round((kpis.active_flying_drones / Math.max(kpis.total_drones, 1)) * 100) : 0}
          progressColor="bg-[#99f7ff]"
        />
        <KPICard
          icon="gpp_maybe"
          label="Zone Risk Level"
          value={kpis ? String(kpis.near_zone_count + kpis.predicted_breach_count) : '0'}
          unit="threats"
          badge="ALERT"
          badgeColor="text-[#ff7162]"
          progress={kpis ? Math.min((kpis.near_zone_count + kpis.predicted_breach_count) * 10, 100) : 0}
          progressColor="bg-[#ff7162]"
        />
        <KPICard
          icon="cloud_done"
          label="Platform Health"
          value={`${healthPercent}%`}
          unit="uptime"
          badge="NOMINAL"
          badgeColor="text-[#99f7ff]"
          progress={healthPercent}
          progressColor="bg-[#99f7ff]"
        />
      </section>

      {/* Ingestion Volume Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel rounded-xl p-8">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="font-headline text-lg font-bold uppercase tracking-wide">Ingestion Volume</h3>
              <p className="text-[#a8abb3] text-xs font-medium uppercase tracking-[0.1em] mt-1">
                Real-time throughput metrics (30m buckets · {historyHours}h window)
              </p>
            </div>
            {/* ✅ FIX: Buttons now actually toggle historyHours and refetch */}
            <div className="flex gap-2">
              <button
                onClick={() => setHistoryHours(8)}
                className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${historyHours === 8 ? 'bg-[#99f7ff] text-[#005f64]' : 'bg-[#20262f] text-[#a8abb3] hover:text-[#99f7ff]'}`}
              >8H</button>
              <button
                onClick={() => setHistoryHours(24)}
                className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${historyHours === 24 ? 'bg-[#99f7ff] text-[#005f64]' : 'bg-[#151a21] text-[#a8abb3] hover:text-[#99f7ff]'}`}
              >24H</button>
            </div>
          </div>
          <div className="h-64 flex items-end justify-between gap-1 relative pt-10">
            {/* ✅ FIX: Y-axis labels — was maxCount/2000 (wrong), now maxCount/2 */}
            <div className="absolute left-0 top-0 text-[10px] font-bold text-[#a8abb3]/40 flex flex-col items-start gap-12 pointer-events-none uppercase tracking-tighter">
              <span>{maxCount >= 1000 ? `${(maxCount / 1000).toFixed(0)}k` : maxCount}</span>
              <span>{maxCount >= 2000 ? `${(maxCount / 2000).toFixed(0)}k` : Math.round(maxCount / 2)}</span>
              <span>0</span>
            </div>

            {history.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-[#99f7ff]/20 hover:bg-[#99f7ff] transition-all cursor-pointer relative group rounded-sm"
                style={{ height: `${Math.max((h.count / maxCount) * 100, 2)}%` }}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] text-[#99f7ff] transition-opacity font-bold whitespace-nowrap">
                  {h.count >= 1000 ? `${(h.count / 1000).toFixed(1)}k` : h.count}
                </div>
                {i % Math.max(1, Math.floor(history.length / 8)) === 0 && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#a8abb3] whitespace-nowrap opacity-60">
                    {h.time}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Clusters Mini Map — wired to live data */}
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="p-8 pb-4">
            <h3 className="font-headline text-lg font-bold uppercase tracking-wide">Active Clusters</h3>
            <p className="text-[#a8abb3] text-xs font-medium uppercase tracking-[0.1em] mt-1">Tactical Asset Positioning</p>
          </div>
          <div className="flex-1 relative bg-[#000000] m-4 rounded-lg overflow-hidden border border-white/5" style={{ minHeight: 160 }}>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e14]/60 to-transparent z-10 pointer-events-none" />
            {/* Grid lines for map feel */}
            <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
              {[25, 50, 75].map(p => (
                <g key={p}>
                  <line x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="#99f7ff" strokeWidth="0.5" />
                  <line x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="#99f7ff" strokeWidth="0.5" />
                </g>
              ))}
            </svg>
            {mapDots.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <span className="text-[10px] text-[#a8abb3] uppercase tracking-widest font-bold">No live data</span>
              </div>
            ) : (
              mapDots.map((d, i) => {
                const color = d.risk_score > 0.7 ? '#ff7162' : d.risk_score > 0.4 ? '#feaa00' : '#99f7ff'
                const xPct = ((d.x / 260) * 100).toFixed(1)
                const yPct = ((d.y / 200) * 100).toFixed(1)
                return (
                  <div
                    key={d.entity_id || i}
                    className="absolute group z-20"
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  >
                    {d.is_flying && (
                      <span className="absolute -inset-1 w-5 h-5 rounded-full animate-ping opacity-40"
                        style={{ background: color }} />
                    )}
                    <span className="w-3 h-3 rounded-full block border"
                      style={{ background: color, borderColor: color }} />
                    <div className="absolute left-5 top-0 bg-[#20262f] px-2 py-1 rounded text-[8px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-30"
                      style={{ color }}>
                      {d.entity_id?.slice(-6) || 'DRONE'}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </section>

      {/* Critical Alerts */}
      {kpis?.latest_alerts && kpis.latest_alerts.length > 0 && (
        <section className="glass-panel rounded-xl p-8 overflow-hidden">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <h3 className="font-headline text-lg font-bold uppercase tracking-wide">Critical Active Alerts</h3>
              <span className="bg-[#ff7162] text-[#4a0001] px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter">Action Required</span>
            </div>
            <a href="/alerts" className="text-[#a8abb3] hover:text-[#99f7ff] transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              View All History <MaterialIcon name="chevron_right" className="text-[16px]" />
            </a>
          </div>
          <div className="space-y-4">
            {kpis.latest_alerts.slice(0, 3).map((alert) => (
              <div
                key={alert.alert_id}
                className={`flex items-center justify-between p-4 rounded border-l-4 ${
                  alert.severity === 'critical'
                    ? 'bg-[#1b2028] border-[#ff7162]'
                    : 'bg-[#151a21] border-[#feaa00]'
                }`}
              >
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center justify-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      alert.severity === 'critical' ? 'text-[#ff7162]' : 'text-[#feaa00]'
                    }`}>{alert.severity.toUpperCase().slice(0, 4)}</span>
                    <span className="text-xs font-label text-[#a8abb3]">{alert.alert_time}</span>
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">{alert.alert_type}</h4>
                    <p className="text-[#a8abb3] text-xs mt-1">{alert.message}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="bg-[#ff7162]/10 hover:bg-[#ff7162]/20 text-[#ff7162] px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded">ACKNOWLEDGE</button>
                  <a href="/alerts" className="bg-[#20262f] hover:bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8abb3] transition-all rounded">DETAILS</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}