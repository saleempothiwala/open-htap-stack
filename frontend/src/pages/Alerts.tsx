import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

interface AlertRecord {
  alert_id: string
  alert_time: string
  entity_id: string
  alert_type: string
  severity: string
  zone_id?: string
  latitude: number
  longitude: number
  altitude_m: number
  message: string
  risk_score: number
}

interface AlertsResponse {
  alerts: AlertRecord[]
  total_count: number
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

const SEVERITY_TABS = [
  { key: '', label: 'All', color: 'text-[#99f7ff]', activeBg: 'bg-[#99f7ff]', activeText: 'text-[#005f64]' },
  { key: 'critical', label: 'Critical', color: 'text-[#ff7162]', activeBg: 'bg-[#ff7162]', activeText: 'text-[#4a0001]' },
  { key: 'warning', label: 'Warning', color: 'text-[#feaa00]', activeBg: 'bg-[#feaa00]', activeText: 'text-[#503300]' },
  { key: 'info', label: 'Info', color: 'text-[#a8abb3]', activeBg: 'bg-[#20262f]', activeText: 'text-white' },
]

function severityStyles(severity: string) {
  if (severity === 'critical') return { border: 'border-[#ff7162]', bg: 'bg-[#1b2028]', text: 'text-[#ff7162]' }
  if (severity === 'warning')  return { border: 'border-[#feaa00]', bg: 'bg-[#1b1a14]', text: 'text-[#feaa00]' }
  return { border: 'border-[#44484f]', bg: 'bg-[#151a21]', text: 'text-[#a8abb3]' }
}

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score > 0.7 ? '#ff7162' : score > 0.4 ? '#feaa00' : '#99f7ff'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-black/40 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[9px] font-bold" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [severityFilter, setSeverityFilter] = useState('')
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isFetching } = useQuery<AlertsResponse>({
    queryKey: ['alerts', severityFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' })
      if (severityFilter) params.set('severity', severityFilter)
      return fetch(`/api/alerts?${params}`).then((r) => r.json())
    },
    refetchInterval: 5000,
  })

  const ackMutation = useMutation({
    mutationFn: async (alert_id: string) => {
      await fetch(`/api/demo/alerts/${alert_id}/acknowledge`, { method: 'POST' })
      return alert_id
    },
    onSuccess: (alert_id) => {
      setAcknowledgedIds((prev) => new Set([...prev, alert_id]))
      queryClient.invalidateQueries({ queryKey: ['kpis'] })
    },
  })

  const alerts = data?.alerts ?? []
  const total = data?.total_count ?? 0

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount  = alerts.filter((a) => a.severity === 'warning').length

  const handleMapFly = (alert: AlertRecord) => {
    // Navigate to map; the map page reads a sessionStorage hint
    if (alert.latitude && alert.longitude) {
      sessionStorage.setItem('mapFlyTo', JSON.stringify({ lat: alert.latitude, lng: alert.longitude, entityId: alert.entity_id }))
    }
    navigate('/map')
  }

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#ff7162] animate-pulse" />
            <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#ff7162] font-bold">Incident Stream</span>
          </div>
          <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] uppercase">Alerts</h1>
        </div>
        <div className="flex gap-4 items-center">
          {isFetching && !isLoading && (
            <span className="text-[10px] text-[#99f7ff]/60 uppercase tracking-widest font-bold flex items-center gap-1">
              <MaterialIcon name="sync" className="text-[14px] animate-spin" /> Live
            </span>
          )}
          <div className="text-right">
            <p className="text-[10px] text-[#a8abb3] uppercase tracking-widest font-medium">Total Alerts</p>
            <p className="text-2xl font-headline font-black text-[#f1f3fc]">{total}</p>
          </div>
          {criticalCount > 0 && (
            <div className="bg-[#ff7162]/10 border border-[#ff7162]/30 px-4 py-2 rounded-lg text-center">
              <p className="text-[10px] font-bold text-[#ff7162] uppercase tracking-widest">Critical</p>
              <p className="text-xl font-headline font-black text-[#ff7162]">{criticalCount}</p>
            </div>
          )}
          {warningCount > 0 && (
            <div className="bg-[#feaa00]/10 border border-[#feaa00]/30 px-4 py-2 rounded-lg text-center">
              <p className="text-[10px] font-bold text-[#feaa00] uppercase tracking-widest">Warning</p>
              <p className="text-xl font-headline font-black text-[#feaa00]">{warningCount}</p>
            </div>
          )}
        </div>
      </div>

      {/* Severity Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {SEVERITY_TABS.map((tab) => {
          const count = tab.key === ''
            ? alerts.length
            : alerts.filter((a) => a.severity === tab.key).length
          const isActive = severityFilter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSeverityFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                isActive
                  ? `${tab.activeBg} ${tab.activeText}`
                  : `bg-[#151a21] ${tab.color} opacity-70 hover:opacity-100 border border-white/5`
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isActive ? 'bg-black/20' : 'bg-white/10'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Alert Feed */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="glass-panel rounded-xl p-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-t-transparent border-[#ff7162] rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#a8abb3]">Loading Alert Stream...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="glass-panel rounded-xl p-20 text-center opacity-50">
            <MaterialIcon name="check_circle" className="text-6xl text-[#99f7ff] mb-4" />
            <p className="font-headline text-lg font-bold uppercase tracking-wide">No Active Alerts</p>
            <p className="text-sm text-[#a8abb3] mt-2">All systems nominal. No incidents matching current filter.</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const { border, bg, text } = severityStyles(alert.severity)
            const isAcknowledged = acknowledgedIds.has(alert.alert_id)
            return (
              <div
                key={alert.alert_id}
                className={`${bg} border-l-4 ${border} rounded-r-lg p-5 transition-all ${isAcknowledged ? 'opacity-40' : 'hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Severity pill */}
                    <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${text}`}>
                        {alert.severity.slice(0, 4).toUpperCase()}
                      </span>
                      <span className="text-[8px] text-[#a8abb3] font-medium">{alert.alert_time?.slice(11, 19)}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h4 className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">{alert.alert_type}</h4>
                        <span className="font-label text-[10px] text-[#a8abb3] bg-white/5 px-2 py-0.5 rounded">{alert.entity_id}</span>
                        {alert.zone_id && (
                          <span className="font-label text-[10px] text-[#feaa00] bg-[#feaa00]/10 px-2 py-0.5 rounded">{alert.zone_id}</span>
                        )}
                        {isAcknowledged && (
                          <span className="font-label text-[10px] text-[#99f7ff] bg-[#99f7ff]/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <MaterialIcon name="check" className="text-[12px]" /> Acknowledged
                          </span>
                        )}
                      </div>
                      <p className="text-[#a8abb3] text-xs mt-1.5 leading-relaxed line-clamp-2">{alert.message}</p>
                      <RiskBar score={alert.risk_score} />
                      {alert.latitude !== 0 && (
                        <p className="text-[9px] text-[#a8abb3]/50 mt-1 font-mono">
                          {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)} · {alert.altitude_m?.toFixed(0)}m
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {!isAcknowledged && (
                      <button
                        onClick={() => ackMutation.mutate(alert.alert_id)}
                        disabled={ackMutation.isPending}
                        className="bg-[#ff7162]/10 hover:bg-[#ff7162]/25 text-[#ff7162] px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded whitespace-nowrap"
                      >
                        {ackMutation.isPending && ackMutation.variables === alert.alert_id
                          ? 'ACK...'
                          : 'ACKNOWLEDGE'}
                      </button>
                    )}
                    {alert.latitude !== 0 && (
                      <button
                        onClick={() => handleMapFly(alert)}
                        className="bg-[#20262f] hover:bg-white/5 text-[#a8abb3] hover:text-[#99f7ff] px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded flex items-center gap-1 whitespace-nowrap"
                      >
                        <MaterialIcon name="map" className="text-[14px]" /> VIEW MAP
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}