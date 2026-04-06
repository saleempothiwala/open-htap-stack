import { useQuery } from '@tanstack/react-query'

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
  total_events: number
  platform_health_score: number
  ingestion_rate_per_min: number
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

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

function KPICard({ icon, label, value, unit, badge, badgeColor, progress, progressColor }: {
  icon: string; label: string; value: string; unit: string;
  badge?: string; badgeColor?: string; progress?: number; progressColor?: string;
}) {
  return (
    <div className="bg-[#151a21] p-6 rounded-lg relative group transition-all hover:bg-[#1b2028] cursor-default">
      <div className="flex justify-between items-start mb-4">
        <MaterialIcon name={icon} className="text-[#00e2ee]" />
        {badge && (
          <span className={`text-[10px] font-bold ${badgeColor} px-2 py-0.5 bg-${badgeColor}/10 rounded tracking-tighter`}>{badge}</span>
        )}
      </div>
      <p className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-headline font-bold">{value}</span>
        <span className="text-[#a8abb3] text-xs font-light">{unit}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1 w-full bg-[#000000] rounded-full overflow-hidden">
          <div className={`h-full ${progressColor || 'bg-[#99f7ff]'} transition-all duration-500`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
        </div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const { data: kpis, isLoading } = useQuery<KPIs>({
    queryKey: ['kpis'],
    queryFn: () => fetch('/api/overview/kpis').then((r) => r.json()),
    refetchInterval: 3000,
  })

  const healthScore = kpis?.platform_health_score ?? 0.98
  const healthPercent = Math.round(healthScore * 100)

  return (
    <>
      {/* Hero Section */}
      <section className="relative grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        <div className="lg:col-span-2 glass-panel p-10 rounded-xl relative overflow-hidden flex flex-col justify-between group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <MaterialIcon name="vital_signs" className="text-[#99f7ff] text-[160px]" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
              <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">The System Pulse</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">
              {isLoading ? 'CONNECTING...' : 'SYSTEM PULSE: OPTIMAL'}
            </h1>
            <p className="text-[#a8abb3] max-w-xl text-lg font-light leading-relaxed mb-8">
              All heuristic pipelines are operating within nominal parameters.
              Real-time ingestion latency is 4ms below the defined threshold.
              Assets are fully synchronized.
            </p>
          </div>
          <div className="flex gap-4">
            <button className="bg-[#99f7ff] hover:bg-[#00e2ee] text-[#005f64] px-8 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95">
              EXECUTE RE-SYNC
            </button>
            <button className="border border-[#99f7ff]/20 hover:border-[#99f7ff]/60 text-[#99f7ff] px-8 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95">
              DOWNLOAD LOG
            </button>
          </div>
        </div>

        {/* Platform Stability Gauge */}
        <div className="glass-panel p-10 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="relative w-48 h-48 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#20262f]"></div>
            <div className="absolute inset-0 rounded-full horizon-gauge opacity-80" style={{ transform: `rotate(${healthScore * 360 - 10}deg)` }}></div>
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
          value={kpis ? `${(kpis.ingestion_rate_per_min / 60).toFixed(1)}k` : '0'}
          unit="/sec"
          badge="LIVE"
          badgeColor="text-[#99f7ff]"
          progress={74}
          progressColor="bg-[#99f7ff]"
        />
        <KPICard
          icon="helicopter"
          label="Active Drones"
          value={kpis ? String(kpis.active_flying_drones) : '0'}
          unit="units"
          badge="BUSY"
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
              <p className="text-[#a8abb3] text-xs font-medium uppercase tracking-[0.1em] mt-1">Real-time throughput metrics</p>
            </div>
            <div className="flex gap-2">
              <button className="bg-[#20262f] px-3 py-1 rounded text-[10px] font-bold text-[#99f7ff]">60S</button>
              <button className="bg-[#151a21] px-3 py-1 rounded text-[10px] font-bold text-[#a8abb3]">5M</button>
              <button className="bg-[#151a21] px-3 py-1 rounded text-[10px] font-bold text-[#a8abb3]">1H</button>
            </div>
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {[40, 55, 70, 65, 85, 45, 30, 92, 60, 50, 75, 100, 65, 45, 35].map((h, i) => (
              <div
                key={i}
                className="w-full bg-[#99f7ff]/20 hover:bg-[#99f7ff] transition-colors cursor-pointer relative group rounded-sm"
                style={{ height: `${h}%` }}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] text-[#99f7ff] transition-opacity">
                  {((h / 100) * 12.4).toFixed(1)}k
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Clusters Mini Map */}
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="p-8 pb-4">
            <h3 className="font-headline text-lg font-bold uppercase tracking-wide">Active Clusters</h3>
            <p className="text-[#a8abb3] text-xs font-medium uppercase tracking-[0.1em] mt-1">Tactical Asset Positioning</p>
          </div>
          <div className="flex-1 relative bg-[#000000] m-4 rounded-lg overflow-hidden border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e14]/80 to-transparent z-10"></div>
            {/* Simulated map points */}
            <div className="absolute top-1/4 left-1/3 group">
              <span className="w-4 h-4 bg-[#99f7ff]/40 rounded-full flex items-center justify-center animate-ping absolute -inset-0.5"></span>
              <span className="w-3 h-3 bg-[#99f7ff] rounded-full block relative border border-[#005f64]"></span>
              <div className="absolute left-6 top-0 bg-[#20262f] px-2 py-1 rounded text-[8px] font-bold text-[#99f7ff] opacity-0 group-hover:opacity-100 transition-opacity">ALPHA-9</div>
            </div>
            <div className="absolute bottom-1/3 right-1/4 group">
              <span className="w-3 h-3 bg-[#feaa00] rounded-full block relative border border-[#503300]"></span>
              <div className="absolute left-6 top-0 bg-[#20262f] px-2 py-1 rounded text-[8px] font-bold text-[#feaa00] opacity-0 group-hover:opacity-100 transition-opacity">BETA-CORE</div>
            </div>
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
            <button className="text-[#a8abb3] hover:text-[#99f7ff] transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              View All History <MaterialIcon name="chevron_right" className="text-[16px]" />
            </button>
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
                  <button className="bg-[#ff7162]/10 hover:bg-[#ff7162]/20 text-[#ff7162] px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all">ACKNOWLEDGE</button>
                  <button className="bg-[#20262f] hover:bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8abb3] transition-all">DETAILS</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}