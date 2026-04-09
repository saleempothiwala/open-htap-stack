import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, useMap } from 'react-leaflet'
import { Icon, LatLngExpression } from 'leaflet'
import { useQuery } from '@tanstack/react-query'

interface DronePosition {
  entity_id: string
  event_time: string
  latitude: number
  longitude: number
  altitude_m: number
  speed_mps: number
  heading_deg: number
  is_flying: boolean
  temp_internal_c: number
  temp_external_c: number
  near_restricted_zone: boolean
  predicted_zone_breach: boolean
  risk_score: number
}

interface RestrictedZone {
  zone_id: string
  zone_name: string
  polygon_wkt: string
  severity: string
  enabled: boolean
}

interface MapLiveData {
  drones: DronePosition[]
  zones: RestrictedZone[]
  timestamp: string
}

// Custom drone icons
const makeIcon = (color: string) => new Icon({
  iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
      <circle cx="12" cy="12" r="3" fill="${color}" fill-opacity="0.8"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
    </svg>
  `)}`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const droneIcon        = makeIcon('#00e2ee')
const droneIconFlying  = makeIcon('#99f7ff')
const droneIconWarning = makeIcon('#feaa00')
const droneIconDanger  = makeIcon('#ff7162')

function parseWktPolygon(wkt: string): LatLngExpression[] {
  const match = wkt.match(/\(\((.+?)\)\)/)
  if (!match || !match[1]) return []
  return match[1].split(',').map((c) => {
    const [lon, lat] = c.trim().split(' ').map(Number)
    return [lat, lon] as LatLngExpression
  })
}

// ✅ FIX: Zone color now respects severity
function getZoneColor(severity: string): string {
  if (severity === 'critical') return '#ff7162'
  if (severity === 'warning')  return '#feaa00'
  return '#99f7ff'
}

function getDroneIcon(drone: DronePosition): Icon {
  if (drone.predicted_zone_breach || drone.risk_score > 0.7) return droneIconDanger
  if (drone.near_restricted_zone  || drone.risk_score > 0.4) return droneIconWarning
  if (drone.is_flying) return droneIconFlying
  return droneIcon
}

// Component to invalidate map size + handle fly-to from sessionStorage
function MapController({ flyTo }: { flyTo: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], 14, { duration: 1.5 })
    }
  }, [map, flyTo])
  return null
}

export default function MapPage() {
  const [filter, setFilter] = useState<'all' | 'flying' | 'warning'>('all')
  const [selectedDrone, setSelectedDrone] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)

  // Read sessionStorage fly-to hint from Alerts page
  useEffect(() => {
    const stored = sessionStorage.getItem('mapFlyTo')
    if (stored) {
      try {
        const { lat, lng } = JSON.parse(stored)
        setFlyTo({ lat, lng })
      } catch { /* ignore */ }
      sessionStorage.removeItem('mapFlyTo')
    }
  }, [])

  const { data, isLoading } = useQuery<MapLiveData>({
    queryKey: ['map-live'],
    queryFn: () => fetch('/api/map/live?limit=500').then((r) => r.json()),
    refetchInterval: 5000,
  })

  const drones = data?.drones ?? []
  const zones  = data?.zones  ?? []

  // ✅ PERF: Memoize all derived values
  const filteredDrones = useMemo(() => drones.filter((d) => {
    if (filter === 'flying')  return d.is_flying
    if (filter === 'warning') return d.near_restricted_zone || d.predicted_zone_breach
    return true
  }), [drones, filter])

  const { center, bounds } = useMemo(() => {
    const coords: [number, number][] = []
    filteredDrones.forEach((d) => { if (d.latitude && d.longitude) coords.push([d.latitude, d.longitude]) })
    zones.forEach((z) => {
      parseWktPolygon(z.polygon_wkt).forEach((p) => {
        if (Array.isArray(p)) coords.push([p[0] as number, p[1] as number])
      })
    })
    const defaultCenter: LatLngExpression = [59.91, 10.75]
    if (coords.length === 0) return { center: defaultCenter, bounds: undefined }
    const center: LatLngExpression = [
      coords.reduce((s, c) => s + c[0], 0) / coords.length,
      coords.reduce((s, c) => s + c[1], 0) / coords.length,
    ]
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...coords.map((c) => c[0])), Math.min(...coords.map((c) => c[1]))],
      [Math.max(...coords.map((c) => c[0])), Math.max(...coords.map((c) => c[1]))],
    ]
    return { center, bounds }
  }, [filteredDrones, zones])

  // Trail mode: positions for selected drone (simulated trail from current pos)
  const trailPositions = useMemo((): LatLngExpression[] => {
    if (!selectedDrone) return []
    const drone = drones.find((d) => d.entity_id === selectedDrone)
    if (!drone || !drone.latitude) return []
    // Simulate trail: 8 slightly offset positions going "backward" in heading
    const rad = (drone.heading_deg * Math.PI) / 180
    const trail: LatLngExpression[] = []
    for (let i = 8; i >= 0; i--) {
      const dist = i * 0.0008 // ~90m per step
      trail.push([
        drone.latitude  + dist * Math.cos(rad + Math.PI),
        drone.longitude + dist * Math.sin(rad + Math.PI),
      ])
    }
    trail.push([drone.latitude, drone.longitude])
    return trail
  }, [selectedDrone, drones])

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse" />
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">Live Operations</span>
        </div>
        <div className="flex gap-2">
          {(['all', 'flying', 'warning'] as const).map((f) => {
            const count = f === 'all' ? drones.length
              : f === 'flying' ? drones.filter((d) => d.is_flying).length
              : drones.filter((d) => d.near_restricted_zone || d.predicted_zone_breach).length
            const isActive = filter === f
            const dangerMode = f === 'warning'
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? dangerMode ? 'bg-[#ff7162] text-[#4a0001]' : 'bg-[#99f7ff] text-[#005f64]'
                    : `bg-[#20262f] text-[#a8abb3] hover:text-[${dangerMode ? '#ff7162' : '#99f7ff'}]`
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
              </button>
            )
          })}
        </div>
      </div>

      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Drone Map</h1>

      {selectedDrone && (
        <div className="mb-4 flex items-center gap-3 bg-[#1b2028] border border-[#99f7ff]/20 px-4 py-2 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[#99f7ff]">Trail Mode Active</span>
          <span className="text-[10px] text-[#a8abb3] font-medium">— {selectedDrone}</span>
          <button
            onClick={() => setSelectedDrone(null)}
            className="ml-auto text-[10px] font-black text-[#a8abb3] hover:text-[#ff7162] uppercase tracking-widest transition-colors"
          >
            CLEAR TRAIL
          </button>
        </div>
      )}

      <div className="glass-panel rounded-xl overflow-hidden relative" style={{ height: '75vh' }}>
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-[#a8abb3]">
            <div className="text-center">
              <span className="material-symbols-outlined text-[#99f7ff] text-6xl mb-4 animate-spin">sync</span>
              <p className="font-headline text-lg font-bold uppercase tracking-wide">Loading Map Data...</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full">
            <MapContainer
              center={center}
              zoom={11}
              style={{ width: '100%', height: '100%', zIndex: 1 }}
              zoomControl={false}
              bounds={bounds}
              boundsOptions={{ padding: [50, 50] }}
            >
              <MapController flyTo={flyTo} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                crossOrigin="anonymous"
              />

              {/* Restricted Zones — ✅ FIX: color from severity */}
              {zones.map((zone) => {
                const positions = parseWktPolygon(zone.polygon_wkt)
                if (positions.length === 0) return null
                const color = getZoneColor(zone.severity)
                return (
                  <Polygon
                    key={zone.zone_id}
                    positions={positions}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '6, 5' }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 4px', textTransform: 'uppercase' }}>{zone.zone_name}</p>
                        <p style={{ fontSize: 11, margin: 0, color: color, fontWeight: 600, textTransform: 'uppercase' }}>{zone.severity}</p>
                      </div>
                    </Popup>
                  </Polygon>
                )
              })}

              {/* Trail polyline */}
              {trailPositions.length > 1 && (
                <Polyline
                  positions={trailPositions}
                  pathOptions={{ color: '#99f7ff', weight: 2, opacity: 0.7, dashArray: '4, 4' }}
                />
              )}

              {/* Drone Markers */}
              {filteredDrones.map((drone) => {
                if (!drone.latitude || !drone.longitude) return null
                const position: LatLngExpression = [drone.latitude, drone.longitude]
                const icon = getDroneIcon(drone)
                const isSelected = selectedDrone === drone.entity_id
                return (
                  <Marker
                    key={drone.entity_id}
                    position={position}
                    icon={icon}
                    eventHandlers={{ click: () => setSelectedDrone(isSelected ? null : drone.entity_id) }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 200 }}>
                        <p style={{ fontWeight: 700, fontSize: 12, margin: '0 0 8px', textTransform: 'uppercase' }}>{drone.entity_id}</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <tbody>
                            {[
                              ['Status',    drone.is_flying ? '🟢 Flying' : '⬜ Grounded'],
                              ['Speed',     `${drone.speed_mps.toFixed(1)} m/s`],
                              ['Altitude',  `${drone.altitude_m.toFixed(0)} m`],
                              ['Heading',   `${drone.heading_deg.toFixed(0)}°`],
                              ['Risk',      `${(drone.risk_score * 100).toFixed(0)}%`],
                              ['Temp Int',  `${drone.temp_internal_c.toFixed(1)}°C`],
                              ['Temp Ext',  `${drone.temp_external_c.toFixed(1)}°C`],
                            ].map(([k, v]) => (
                              <tr key={k}>
                                <td style={{ color: '#888', paddingRight: 8, paddingBottom: 2 }}>{k}:</td>
                                <td style={{ fontWeight: 600 }}>{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {drone.near_restricted_zone && (
                          <p style={{ color: '#feaa00', fontSize: 11, marginTop: 6, fontWeight: 700 }}>⚠ NEAR RESTRICTED ZONE</p>
                        )}
                        {drone.predicted_zone_breach && (
                          <p style={{ color: '#ff7162', fontSize: 11, marginTop: 4, fontWeight: 700 }}>🚨 PREDICTED BREACH</p>
                        )}
                        <button
                          onClick={() => setSelectedDrone(isSelected ? null : drone.entity_id)}
                          style={{ marginTop: 8, background: '#151a21', border: '1px solid #99f7ff44', color: '#99f7ff', padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', textTransform: 'uppercase', width: '100%' }}
                        >
                          {isSelected ? 'CLEAR TRAIL' : 'SHOW TRAIL'}
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 mt-4 text-xs font-bold uppercase tracking-wider text-[#a8abb3]">
        {[
          { color: '#99f7ff',  label: 'Flying' },
          { color: '#feaa00',  label: 'Near Zone' },
          { color: '#ff7162',  label: 'Breach Risk' },
          { color: '#ff7162',  label: 'Critical Zone', dashed: true },
          { color: '#feaa00',  label: 'Warning Zone',  dashed: true },
          { color: '#99f7ff',  label: 'Info Zone',     dashed: true },
        ].map(({ color, label, dashed }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${dashed ? 'border-2 border-dashed bg-transparent' : ''}`}
              style={{ background: dashed ? 'transparent' : color, borderColor: dashed ? color : undefined }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 border-dashed border-t-2 border-[#99f7ff]" />
          <span>Trail</span>
        </div>
      </div>
    </section>
  )
}