import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface DemoSettings {
  drones_enabled: number
  events_per_sec: number
  outlier_percent: number
  inject_breach_alerts: boolean
  replay_mode: boolean
  replay_minutes: number
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed bottom-24 right-8 z-[100] flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl border animate-fade-in ${
      type === 'success'
        ? 'bg-[#151a21] border-[#99f7ff]/30 text-[#99f7ff]'
        : 'bg-[#1b1418] border-[#ff7162]/30 text-[#ff7162]'
    }`}>
      <MaterialIcon name={type === 'success' ? 'check_circle' : 'error'} />
      <span className="text-xs font-bold uppercase tracking-widest">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><MaterialIcon name="close" className="text-[16px]" /></button>
    </div>
  )
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-colors ${value ? 'bg-[#99f7ff]' : 'bg-[#20262f]'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-[#0a0e14] transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [scenarioRunning, setScenarioRunning] = useState(false)

  const [settings, setSettings] = useState<DemoSettings>({
    drones_enabled: 100,
    events_per_sec: 5000,
    outlier_percent: 5.0,
    inject_breach_alerts: false,
    replay_mode: false,
    replay_minutes: 10,
  })

  // Only load from server once on first mount — prevents the refetch poll
  // from overwriting slider values while the user is editing them.
  const serverLoaded = useRef(false)

  const { data } = useQuery({
    queryKey: ['demo-settings'],
    queryFn: () => fetch('/api/settings/demo').then((r) => r.json()),
  })

  // Sync from server once: whichever data arrives first wins (pod startup values).
  // After that, local form state is authoritative until the user clicks Save.
  useEffect(() => {
    if (data?.settings && !serverLoaded.current) {
      setSettings(data.settings)
      serverLoaded.current = true
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (s: DemoSettings) => {
      const r = await fetch('/api/settings/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      if (!r.ok) throw new Error('Save failed')
      return r.json()
    },
    onSuccess: () => {
      setToast({ message: 'Settings saved successfully', type: 'success' })
      serverLoaded.current = false   // allow next refetch to confirm saved value
      queryClient.invalidateQueries({ queryKey: ['demo-settings'] })
    },
    onError: () => setToast({ message: 'Failed to save settings', type: 'error' }),
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/settings/demo/defaults')
      if (!r.ok) throw new Error('Failed to fetch defaults')
      return r.json()
    },
    onSuccess: (data) => {
      if (data?.settings) setSettings(data.settings)
      setToast({ message: 'Reset to pod defaults — click Save to apply', type: 'success' })
    },
    onError: () => setToast({ message: 'Could not load defaults', type: 'error' }),
  })

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/settings/demo/cleanup', { method: 'POST' })
      return r.json()
    },
    onSuccess: (data) => {
      setToast({ message: data.message || 'Stale data cleared', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['kpis'] })
      queryClient.invalidateQueries({ queryKey: ['map-live'] })
    },
    onError: () => setToast({ message: 'Cleanup failed', type: 'error' }),
  })

  const injectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/settings/demo/inject-alert', { method: 'POST' })
      return r.json()
    },
    onSuccess: (data) => {
      setToast({ message: data.message || 'Demo alert injected!', type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['kpis'] })
    },
    onError: () => setToast({ message: 'Failed to inject alert', type: 'error' }),
  })

  const scenarioMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/demo/trigger-breach-scenario', { method: 'POST' })
      return r.json()
    },
    onSuccess: (data) => {
      setScenarioRunning(false)
      setToast({ message: `🚨 BREACH SCENARIO ACTIVE — Drone ${data.entity_id}`, type: 'error' })
      queryClient.invalidateQueries({ queryKey: ['kpis'] })
      queryClient.invalidateQueries({ queryKey: ['map-live'] })
    },
    onError: () => {
      setScenarioRunning(false)
      setToast({ message: 'Scenario injection failed', type: 'error' })
    },
  })

  const handleTriggerScenario = () => {
    setScenarioRunning(true)
    scenarioMutation.mutate()
  }

  return (
    <section>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse" />
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">Demo Controls</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-8 uppercase">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Simulation Controls */}
        <div className="glass-panel rounded-xl p-8">
          <h3 className="font-headline text-lg font-bold uppercase tracking-wide mb-6">Simulation Controls</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Active Drones</label>
                <span className="text-[#99f7ff] text-xs font-bold">{settings.drones_enabled}</span>
              </div>
              <input type="range" min="10" max="500" value={settings.drones_enabled}
                onChange={(e) => setSettings({ ...settings, drones_enabled: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]" />
              <div className="flex justify-between text-[9px] text-[#a8abb3]/50 mt-1 font-medium">
                <span>10</span><span>500</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Events / sec</label>
                <span className="text-[#99f7ff] text-xs font-bold">{settings.events_per_sec.toLocaleString()}</span>
              </div>
              <input type="range" min="50" max="5000" step="50" value={settings.events_per_sec}
                onChange={(e) => setSettings({ ...settings, events_per_sec: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]" />
              <div className="flex justify-between text-[9px] text-[#a8abb3]/50 mt-1 font-medium">
                <span>50</span><span>5,000</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Outlier %</label>
                <span className="text-[#99f7ff] text-xs font-bold">{settings.outlier_percent}%</span>
              </div>
              <input type="range" min="0" max="20" step="0.5" value={settings.outlier_percent}
                onChange={(e) => setSettings({ ...settings, outlier_percent: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]" />
              <div className="flex justify-between text-[9px] text-[#a8abb3]/50 mt-1 font-medium">
                <span>0%</span><span>20%</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Replay Duration</label>
                <span className="text-[#99f7ff] text-xs font-bold">{settings.replay_minutes} min</span>
              </div>
              <input type="range" min="1" max="60" value={settings.replay_minutes}
                onChange={(e) => setSettings({ ...settings, replay_minutes: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]" />
              <div className="flex justify-between text-[9px] text-[#a8abb3]/50 mt-1 font-medium">
                <span>1 min</span><span>60 min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Actions */}
        <div className="glass-panel rounded-xl p-8">
          <h3 className="font-headline text-lg font-bold uppercase tracking-wide mb-6">Demo Actions</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#151a21] rounded">
              <div>
                <p className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">Inject Breach Alerts</p>
                <p className="text-[#a8abb3] text-xs mt-1">Simulate predicted zone breach alerts</p>
              </div>
              <ToggleSwitch
                value={settings.inject_breach_alerts}
                onChange={(v) => setSettings({ ...settings, inject_breach_alerts: v })}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-[#151a21] rounded">
              <div>
                <p className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">Replay Mode</p>
                <p className="text-[#a8abb3] text-xs mt-1">Replay historical telemetry data</p>
              </div>
              <ToggleSwitch
                value={settings.replay_mode}
                onChange={(v) => setSettings({ ...settings, replay_mode: v })}
              />
            </div>

            {/* HTAP Breach Scenario — hero demo button */}
            <button
              onClick={handleTriggerScenario}
              disabled={scenarioMutation.isPending || scenarioRunning}
              className="w-full relative overflow-hidden bg-gradient-to-r from-[#ff7162]/20 to-[#feaa00]/10 hover:from-[#ff7162]/30 hover:to-[#feaa00]/20 border border-[#ff7162]/40 text-[#ff7162] px-6 py-4 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 rounded flex items-center justify-center gap-3 mt-4"
            >
              {(scenarioMutation.isPending || scenarioRunning) ? (
                <><MaterialIcon name="sync" className="animate-spin" /> TRIGGERING SCENARIO...</>
              ) : (
                <><MaterialIcon name="crisis_alert" /> 🎬 TRIGGER BREACH SCENARIO</>
              )}
            </button>

            <button
              onClick={() => injectMutation.mutate()}
              disabled={injectMutation.isPending}
              className="w-full bg-[#feaa00]/10 hover:bg-[#feaa00]/20 border border-[#feaa00]/20 text-[#feaa00] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 rounded flex items-center justify-center gap-2"
            >
              {injectMutation.isPending ? (
                <><MaterialIcon name="sync" className="animate-spin text-[16px]" /> Injecting...</>
              ) : (
                <><MaterialIcon name="warning" className="text-[16px]" /> INJECT DEMO ALERT</>
              )}
            </button>

            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="w-full bg-[#20262f] hover:bg-[#20262f]/80 border border-[#99f7ff]/20 text-[#99f7ff]/60 hover:text-[#99f7ff] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 rounded flex items-center justify-center gap-2"
            >
              {resetMutation.isPending ? (
                <><MaterialIcon name="sync" className="animate-spin text-[16px]" /> Loading Defaults...</>
              ) : (
                <><MaterialIcon name="restart_alt" className="text-[16px]" /> RESET TO POD DEFAULTS</>
              )}
            </button>

            <button
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              title="Removes stale drone rows in Cassandra left over from a previous higher drone-count run"
              className="w-full bg-[#ff7162]/10 hover:bg-[#ff7162]/20 border border-[#ff7162]/30 text-[#ff7162]/70 hover:text-[#ff7162] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 rounded flex items-center justify-center gap-2"
            >
              {cleanupMutation.isPending ? (
                <><MaterialIcon name="sync" className="animate-spin text-[16px]" /> Clearing...</>
              ) : (
                <><MaterialIcon name="delete_sweep" className="text-[16px]" /> CLEAR STALE DRONE DATA</>
              )}
            </button>

            <button
              onClick={() => saveMutation.mutate(settings)}
              disabled={saveMutation.isPending}
              className="w-full bg-[#99f7ff] hover:bg-[#00e2ee] text-[#005f64] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 rounded flex items-center justify-center gap-2"
            >
              {saveMutation.isPending ? (
                <><MaterialIcon name="sync" className="animate-spin text-[16px]" /> Saving...</>
              ) : (
                <><MaterialIcon name="save" className="text-[16px]" /> SAVE SETTINGS</>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}