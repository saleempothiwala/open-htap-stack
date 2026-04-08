import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
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

// Custom drone icon
const droneIcon = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBlMmVlIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiIGZpbGw9IiMwMGUyZWUiLz48cGF0aCBkPSJNMTIgMnY0TTEyIDE4djRNMiAxMmg0TTE4IDEyaDRNNS42IDUuNmwyLjggMi44TTE1LjYgMTUuNmwyLjggMi44TTUuNiAxOC40bDIuOC0yLjhNMTUuNiA4LjRsMi44LTIuOCIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const droneIconFlying = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTlmN2ZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiIGZpbGw9IiM5OWY3ZmYiLz48cGF0aCBkPSJNMTIgMnY0TTEyIDE4djRNMiAxMmg0TTE4IDEyaDRNNS42IDUuNmwyLjggMi44TTE1LjYgMTUuNmwyLjggMi44TTUuNiAxOC40bDIuOC0yLjhNMTUuNiA4LjRsMi44LTIuOCIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const droneIconWarning = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmVhYTAwIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiIGZpbGw9IiNmZWFhMDAiLz48cGF0aCBkPSJNMTIgMnY0TTEyIDE4djRNMiAxMmg0TTE4IDEyaDRNNS42IDUuNmwyLjggMi44TTE1LjYgMTUuNmwyLjggMi44TTUuNiAxOC40bDIuOC0yLjhNMTUuNiA4LjRsMi44LTIuOCIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const droneIconDanger = new Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmY3MTYyIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiIGZpbGw9IiNmZjcxNjIiLz48cGF0aCBkPSJNMTIgMnY0TTEyIDE4djRNMiAxMmg0TTE4IDEyaDRNNS42IDUuNmwyLjggMi44TTE1LjYgMTUuNmwyLjggMi44TTUuNiAxOC40bDIuOC0yLjhNMTUuNiA4LjRsMi44LTIuOCIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

function parseWktPolygon(wkt: string): LatLngExpression[] {
  // Parse WKT POLYGON((lon lat, lon lat, ...))
  const match = wkt.match(/\(\((.+?)\)\)/)
  if (!match || !match[1]) return []
  const coords = match[1].split(',').map((c) => {
    const [lon, lat] = c.trim().split(' ').map(Number)
    return [lat, lon] as LatLngExpression
  })
  return coords
}

function getZoneColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#ff7162'
    case 'warning':
      return '#feaa00'
    default:
      return '#99f7ff'
  }
}

// Component to invalidate map size after render
function MapResizeHandler() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize()
    }, 100)
  }, [map])
  return null
}

function getDroneIcon(drone: DronePosition): Icon {
  if (drone.predicted_zone_breach || drone.risk_score > 0.7) return droneIconDanger
  if (drone.near_restricted_zone || drone.risk_score > 0.4) return droneIconWarning
  if (drone.is_flying) return droneIconFlying
  return droneIcon
}

export default function MapPage() {
  const [filter, setFilter] = useState<'all' | 'flying' | 'warning'>('all')
  const mapRef = useRef<any>(null)

  const { data, isLoading } = useQuery<MapLiveData>({
    queryKey: ['map-live'],
    queryFn: () => fetch('/api/map/live?limit=50').then((r) => r.json()),
    refetchInterval: 5000,
  })

  const drones = data?.drones ?? []
  const zones = data?.zones ?? []

  const filteredDrones = drones.filter((d) => {
    if (filter === 'flying') return d.is_flying
    if (filter === 'warning') return d.near_restricted_zone || d.predicted_zone_breach
    return true
  })

  // Calculate bounds to fit all drones and zones
  const allCoords: [number, number][] = []
  filteredDrones.forEach((d) => {
    if (d.latitude && d.longitude) {
      allCoords.push([d.latitude, d.longitude])
    }
  })
  zones.forEach((z) => {
    const poly = parseWktPolygon(z.polygon_wkt)
    poly.forEach((p) => {
      if (Array.isArray(p)) {
        allCoords.push([p[0] as number, p[1] as number])
      }
    })
  })

  const defaultCenter: LatLngExpression = [0, 0]
  const center = allCoords.length > 0
    ? [
      allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
      allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length,
    ] as LatLngExpression
    : defaultCenter

  // Calculate bounds for fitBounds
  const bounds = allCoords.length > 0
    ? [
      [Math.min(...allCoords.map(c => c[0])), Math.min(...allCoords.map(c => c[1]))] as [number, number],
      [Math.max(...allCoords.map(c => c[0])), Math.max(...allCoords.map(c => c[1]))] as [number, number],
    ] as [[number, number], [number, number]]
    : undefined

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">
            Live Operations
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${filter === 'all'
              ? 'bg-[#99f7ff] text-[#005f64]'
              : 'bg-[#20262f] text-[#a8abb3] hover:text-[#99f7ff]'
              }`}
          >
            All ({drones.length})
          </button>
          <button
            onClick={() => setFilter('flying')}
            className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${filter === 'flying'
              ? 'bg-[#99f7ff] text-[#005f64]'
              : 'bg-[#20262f] text-[#a8abb3] hover:text-[#99f7ff]'
              }`}
          >
            Flying ({drones.filter((d) => d.is_flying).length})
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${filter === 'warning'
              ? 'bg-[#ff7162] text-[#4a0001]'
              : 'bg-[#20262f] text-[#a8abb3] hover:text-[#ff7162]'
              }`}
          >
            Alerts ({drones.filter((d) => d.near_restricted_zone || d.predicted_zone_breach).length})
          </button>
        </div>
      </div>

      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">
        Drone Map
      </h1>

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
              zoom={2}
              style={{ width: '100%', height: '100%', zIndex: 1 }}
              zoomControl={false}
              ref={mapRef}
              bounds={bounds}
              boundsOptions={{ padding: [50, 50] }}
            >
              <MapResizeHandler />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                crossOrigin="anonymous"
              />

              {/* Restricted Zones */}
              {zones.map((zone) => {
                const coords = parseWktPolygon(zone.polygon_wkt)
                if (coords.length === 0) return null
                const color = getZoneColor(zone.severity)
                return (
                  <Circle
                    key={zone.zone_id}
                    center={coords[0] as LatLngExpression}
                    radius={2000}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.15,
                      weight: 2,
                      dashArray: '5, 5',
                    }}
                  >
                    <Popup>
                      <div className="text-gray-900">
                        <h3 className="font-bold">{zone.zone_name}</h3>
                        <p className="text-xs text-gray-600 uppercase">{zone.severity}</p>
                      </div>
                    </Popup>
                  </Circle>
                )
              })}

              {/* Drone Markers */}
              {filteredDrones.map((drone) => {
                if (!drone.latitude || !drone.longitude) return null
                const position: LatLngExpression = [drone.latitude, drone.longitude]
                const icon = getDroneIcon(drone)
                return (
                  <Marker key={drone.entity_id} position={position} icon={icon}>
                    <Popup>
                      <div className="text-gray-900 min-w-[200px]">
                        <h3 className="font-bold text-sm uppercase">{drone.entity_id}</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                          <span className="text-gray-500">Status:</span>
                          <span className={drone.is_flying ? 'text-green-600' : 'text-gray-400'}>
                            {drone.is_flying ? 'Flying' : 'Grounded'}
                          </span>
                          <span className="text-gray-500">Speed:</span>
                          <span>{drone.speed_mps.toFixed(1)} m/s</span>
                          <span className="text-gray-500">Altitude:</span>
                          <span>{drone.altitude_m.toFixed(0)} m</span>
                          <span className="text-gray-500">Heading:</span>
                          <span>{drone.heading_deg.toFixed(0)}°</span>
                          <span className="text-gray-500">Temp Int:</span>
                          <span>{drone.temp_internal_c.toFixed(1)}°C</span>
                          <span className="text-gray-500">Temp Ext:</span>
                          <span>{drone.temp_external_c.toFixed(1)}°C</span>
                          <span className="text-gray-500">Risk:</span>
                          <span className={drone.risk_score > 0.5 ? 'text-red-600' : 'text-gray-700'}>
                            {(drone.risk_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        {drone.near_restricted_zone && (
                          <p className="text-xs text-amber-600 mt-2 font-bold">⚠ NEAR RESTRICTED ZONE</p>
                        )}
                        {drone.predicted_zone_breach && (
                          <p className="text-xs text-red-600 mt-2 font-bold">🚨 PREDICTED BREACH</p>
                        )}
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
      <div className="flex gap-6 mt-4 text-xs font-bold uppercase tracking-wider text-[#a8abb3]">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#99f7ff]"></span>
          <span>Flying</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#feaa00]"></span>
          <span>Near Zone</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff7162]"></span>
          <span>Breach Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#ff7162]"></span>
          <span>Restricted Zone</span>
        </div>
      </div>
    </section>
  )
}