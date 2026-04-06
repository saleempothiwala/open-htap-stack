import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface DemoSettings {
  drones_enabled: number
  events_per_sec: number
  outlier_percent: number
  inject_breach_alerts: boolean
  replay_mode: boolean
  replay_minutes: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<DemoSettings>({
    drones_enabled: 100,
    events_per_sec: 500,
    outlier_percent: 5.0,
    inject_breach_alerts: false,
    replay_mode: false,
    replay_minutes: 10,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['demo-settings'],
    queryFn: () => fetch('/api/settings/demo').then((r) => r.json()),
  })

  if (data?.settings) {
    setSettings(data.settings)
  }

  const handleSave = async () => {
    await fetch('/api/settings/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
  }

  const handleInjectAlert = async () => {
    await fetch('/api/settings/demo/inject-alert', { method: 'POST' })
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">Demo Controls</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Simulation Controls */}
        <div className="glass-panel rounded-xl p-8">
          <h3 className="font-headline text-lg font-bold uppercase tracking-wide mb-6">Simulation Controls</h3>
          <div className="space-y-6">
            <div>
              <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium block mb-2">
                Active Drones: {settings.drones_enabled}
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={settings.drones_enabled}
                onChange={(e) => setSettings({ ...settings, drones_enabled: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]"
              />
            </div>
            <div>
              <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium block mb-2">
                Events/sec: {settings.events_per_sec}
              </label>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={settings.events_per_sec}
                onChange={(e) => setSettings({ ...settings, events_per_sec: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]"
              />
            </div>
            <div>
              <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium block mb-2">
                Outlier %: {settings.outlier_percent}%
              </label>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={settings.outlier_percent}
                onChange={(e) => setSettings({ ...settings, outlier_percent: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]"
              />
            </div>
            <div>
              <label className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium block mb-2">
                Replay Duration: {settings.replay_minutes} min
              </label>
              <input
                type="range"
                min="1"
                max="60"
                value={settings.replay_minutes}
                onChange={(e) => setSettings({ ...settings, replay_minutes: Number(e.target.value) })}
                className="w-full accent-[#99f7ff]"
              />
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
              <button
                onClick={() => setSettings({ ...settings, inject_breach_alerts: !settings.inject_breach_alerts })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.inject_breach_alerts ? 'bg-[#99f7ff]' : 'bg-[#20262f]'
                }`}
              >
                <span className={`block w-5 h-5 rounded-full bg-[#0a0e14] transition-transform ${
                  settings.inject_breach_alerts ? 'translate-x-6' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#151a21] rounded">
              <div>
                <p className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">Replay Mode</p>
                <p className="text-[#a8abb3] text-xs mt-1">Replay historical data</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, replay_mode: !settings.replay_mode })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.replay_mode ? 'bg-[#99f7ff]' : 'bg-[#20262f]'
                }`}
              >
                <span className={`block w-5 h-5 rounded-full bg-[#0a0e14] transition-transform ${
                  settings.replay_mode ? 'translate-x-6' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>
            <button
              onClick={handleInjectAlert}
              className="w-full bg-[#ff7162]/10 hover:bg-[#ff7162]/20 text-[#ff7162] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95 mt-4"
            >
              INJECT DEMO ALERT
            </button>
            <button
              onClick={handleSave}
              className="w-full bg-[#99f7ff] hover:bg-[#00e2ee] text-[#005f64] px-6 py-3 font-headline font-bold tracking-wider transition-all cursor-pointer active:scale-95"
            >
              SAVE SETTINGS
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}