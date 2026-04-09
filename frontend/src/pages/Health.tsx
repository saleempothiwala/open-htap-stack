import { useQuery } from '@tanstack/react-query'

interface ServiceHealth {
  name: string
  status: string
}

interface HealthData {
  services: ServiceHealth[]
  overall_health_score: number
  total_drones: number
}

interface LatencyData {
  cassandra_write_ms: number | null
  trino_query_ms: number | null
  vector_search_ms: number | null
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

const SERVICE_ICONS: Record<string, string> = {
  Cassandra: 'database',
  Kafka: 'stream',
  'Presto/Trino': 'analytics',
  Spark: 'bolt',
}

const SERVICE_LATENCY: Record<string, { key: keyof LatencyData; label: string }> = {
  Cassandra:     { key: 'cassandra_write_ms', label: 'Read Latency' },
  'Presto/Trino':{ key: 'trino_query_ms',     label: 'Query Latency' },
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`w-2 h-2 rounded-full inline-block ${
      status === 'up' ? 'bg-[#10b981] animate-pulse' : status === 'down' ? 'bg-[#ff7162]' : 'bg-[#44484f]'
    }`} />
  )
}

function LatencyBar({ ms }: { ms: number | null | undefined }) {
  if (ms == null) return <span className="text-[#44484f] text-xs">—</span>
  const color = ms < 20 ? '#10b981' : ms < 100 ? '#feaa00' : '#ff7162'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(ms / 5, 100)}%`, background: color, transition: 'width 0.5s' }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{ms.toFixed(0)} ms</span>
    </div>
  )
}

export default function HealthPage() {
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ['platform-health'],
    queryFn: () => fetch('/api/platform/health').then((r) => r.json()),
    refetchInterval: 10000,
  })

  const { data: latency } = useQuery<LatencyData>({
    queryKey: ['latency'],
    queryFn: () => fetch('/api/demo/latency').then((r) => r.json()),
    refetchInterval: 10000,
  })

  const healthScore = data?.overall_health_score ?? 0
  const healthPct = Math.round(healthScore * 100)
  const upServices = data?.services.filter((s) => s.status === 'up').length ?? 0
  const totalServices = data?.services.length ?? 0

  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <span className={`w-2 h-2 rounded-full ${healthPct > 50 ? 'bg-[#10b981]' : 'bg-[#ff7162]'} animate-pulse`} />
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#10b981] font-bold">Infrastructure</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] uppercase">Platform Health</h1>

      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Health Score', value: `${healthPct}%`, color: '#10b981', icon: 'monitor_heart' },
            { label: 'Services Up', value: `${upServices} / ${totalServices}`, color: '#99f7ff', icon: 'cloud_done' },
            { label: 'Total Drones', value: String(data.total_drones), color: '#feaa00', icon: 'helicopter' },
            { label: 'Write Latency', value: latency?.cassandra_write_ms != null ? `${latency.cassandra_write_ms.toFixed(0)}ms` : '—', color: '#99f7ff', icon: 'speed' },
          ].map((m) => (
            <div key={m.label} className="bg-[#151a21] p-5 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
            <MaterialIcon name={m.icon} className={`text-[14px] text-[${m.color}]`} />
                <p className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">{m.label}</p>
              </div>
              <p className="text-2xl font-headline font-black" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <p className="text-[#a8abb3] col-span-full text-center py-12">Loading...</p>
        ) : (
          data?.services.map((svc) => {
            const latKey = SERVICE_LATENCY[svc.name]
            const latMs = latKey ? latency?.[latKey.key] : undefined
            const icon = SERVICE_ICONS[svc.name] || 'cloud'
            const isUp = svc.status === 'up'
            return (
              <div key={svc.name} className="bg-[#151a21] p-6 rounded-lg transition-all hover:bg-[#1b2028] border border-white/5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUp ? 'bg-[#10b981]/10' : 'bg-[#ff7162]/10'}`}>
                      <MaterialIcon name={icon} className={isUp ? 'text-[#10b981]' : 'text-[#ff7162]'} />
                    </div>
                    <div>
                      <span className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">{svc.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusDot status={svc.status} />
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isUp ? 'text-[#10b981]' : 'text-[#ff7162]'}`}>
                          {svc.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-tighter ${
                    isUp ? 'text-[#10b981] bg-[#10b981]/10' : 'text-[#ff7162] bg-[#ff7162]/10'
                  }`}>
                    {isUp ? '100%' : '0%'} uptime
                  </span>
                </div>

                {/* Availability bar */}
                <div className="h-1 w-full bg-[#000000] rounded-full overflow-hidden mb-4">
                  <div className={`h-full transition-all duration-700 ${isUp ? 'bg-[#10b981]' : 'bg-[#ff7162]'}`}
                    style={{ width: isUp ? '100%' : '0%' }} />
                </div>

                {/* Latency if available */}
                {latKey && (
                  <div>
                    <p className="text-[9px] font-bold text-[#a8abb3] uppercase tracking-widest mb-1">{latKey.label}</p>
                    <LatencyBar ms={latMs} />
                  </div>
                )}

                {/* No latency info */}
                {!latKey && (
                  <p className="text-[10px] text-[#a8abb3]/50 italic">No latency probe configured</p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* HTAP Latency Breakdown */}
      {latency && (
        <div className="glass-panel rounded-xl p-8">
          <h3 className="font-headline text-lg font-bold uppercase tracking-wide mb-6">HTAP Latency Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Cassandra (OLTP)', sub: 'Point read · drone_latest_status', ms: latency.cassandra_write_ms, color: '#99f7ff', threshold: 20 },
              { label: 'Presto / Trino (OLAP)', sub: 'Full-table analytical query', ms: latency.trino_query_ms, color: '#feaa00', threshold: 500 },
              { label: 'Vector ANN Search', sub: 'Semantic similarity (Cassandra 5)', ms: latency.vector_search_ms, color: '#c084fc', threshold: 50 },
            ].map((m) => {
              const good = m.ms != null && m.ms < m.threshold
              return (
                <div key={m.label} className="bg-[#0f141a] rounded-lg p-5 border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: m.color }}>{m.label}</p>
                  <p className="text-[9px] text-[#a8abb3] mb-3">{m.sub}</p>
                  <p className="text-3xl font-headline font-black" style={{ color: m.ms != null ? m.color : '#44484f' }}>
                    {m.ms != null ? `${m.ms.toFixed(0)}` : '—'}
                    <span className="text-xs font-normal ml-1">ms</span>
                  </p>
                  {m.ms != null && (
                    <p className={`text-[10px] font-bold mt-1 ${good ? 'text-[#10b981]' : 'text-[#feaa00]'}`}>
                      {good ? '✓ Within SLA' : '⚠ Above threshold'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}