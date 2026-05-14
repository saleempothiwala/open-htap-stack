import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'

interface QueryResult {
  columns: string[]
  rows: any[][]
  row_count: number
  query_time_ms: number
}

interface VectorResult {
  entity_id: string
  latitude?: number
  longitude?: number
  altitude_m?: number
  text_payload?: string
  is_flying?: boolean
  similarity?: number
  [key: string]: any
}

interface AISearchResponse {
  results: VectorResult[]
  query_time_ms: number
  summary?: string
}



function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

// ──────────────────── Inline Toast ────────────────────
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-24 right-8 z-[100] flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl border animate-fade-in ${
      type === 'success' ? 'bg-[#151a21] border-[#99f7ff]/30 text-[#99f7ff]'
      : type === 'error' ? 'bg-[#1b1418] border-[#ff7162]/30 text-[#ff7162]'
      : 'bg-[#1a1b14] border-[#feaa00]/30 text-[#feaa00]'
    }`}>
      <MaterialIcon name={type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'} />
      <span className="text-xs font-bold uppercase tracking-widest">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><MaterialIcon name="close" className="text-[14px]" /></button>
    </div>
  )
}

// ──────────────────── SQL Editor (syntax-colour via spans) ────────────────────

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-black/20 border-b border-white/10">
            {result.columns.map((col) => (
              <th key={col} className="px-6 py-4 text-[10px] font-black text-[#99f7ff] uppercase tracking-widest">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {result.rows.map((row, i) => (
            <tr key={i} className="hover:bg-white/[0.04] transition-colors">
              {row.map((val, j) => (
                <td key={j} className="px-6 py-4 text-xs font-medium text-[#f1f3fc] whitespace-normal max-w-md">
                  {typeof val === 'boolean'
                    ? <span className={val ? 'text-[#99f7ff]' : 'text-[#a8abb3]'}>{val ? 'YES' : 'NO'}</span>
                    : String(val ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────── AI Result Cards ────────────────────
function AIResultCards({ results }: { results: VectorResult[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
      {results.map((r, i) => (
        <div key={r.entity_id || i} className="bg-[#1b2028] border border-[#feaa00]/20 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-headline font-bold text-[#feaa00] uppercase text-sm">{r.entity_id}</span>
            {r.similarity !== undefined && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(254,170,0,0.15)', color: '#feaa00' }}>
                {(r.similarity * 100).toFixed(1)}% match
              </span>
            )}
          </div>
          {r.text_payload && (
            <p className="text-[11px] text-[#a8abb3] leading-relaxed line-clamp-3">{r.text_payload}</p>
          )}
          <div className="flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-wider">
            {r.is_flying !== undefined && (
              <span className={`px-2 py-0.5 rounded ${r.is_flying ? 'bg-[#99f7ff]/10 text-[#99f7ff]' : 'bg-white/5 text-[#a8abb3]'}`}>
                {r.is_flying ? 'Flying' : 'Grounded'}
              </span>
            )}
            {r.altitude_m && <span className="bg-white/5 text-[#a8abb3] px-2 py-0.5 rounded">{r.altitude_m?.toFixed(0)}m</span>}
            {r.latitude && <span className="bg-white/5 text-[#a8abb3] px-2 py-0.5 rounded">{r.latitude?.toFixed(3)}, {r.longitude?.toFixed(3)}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ──────────────────── HTAP Compare Panel ────────────────────

interface EngineResult {
  columns: string[]
  rows: any[][]
  row_count: number
  query_time_ms: number
  error: string | null
  available: boolean
}

interface BenchmarkResponse {
  cassandra: EngineResult
  trino: EngineResult
  spark: EngineResult
}

function EngineCard({
  title, sub, color, result,
}: {
  title: string; sub: string; color: string; result: EngineResult | undefined
}) {
  if (!result) return null

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{title}</p>
          <p className="text-[9px] text-[#a8abb3] mt-0.5">{sub}</p>
        </div>
        {result.available && !result.error && (
          <div className="text-right">
            <p className="text-2xl font-headline font-black" style={{ color }}>
              {result.query_time_ms.toFixed(0)}<span className="text-xs font-normal ml-1">ms</span>
            </p>
            <p className="text-[9px] text-[#a8abb3]">{result.row_count} rows</p>
          </div>
        )}
      </div>

      {/* Error states */}
      {!result.available && (
        <div className="p-6 flex items-start gap-3 text-[#feaa00]">
          <span className="material-symbols-outlined text-[18px] shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>info</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">Engine not connected</p>
            <p className="text-[10px] mt-1 text-[#a8abb3]">
              Start the service and try again. This engine is skipped in the benchmark.
            </p>
          </div>
        </div>
      )}
      {result.available && result.error && (
        <div className="p-6 flex items-start gap-3 text-[#ff7162]">
          <span className="material-symbols-outlined text-[18px] shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>error</span>
          <p className="text-xs font-mono break-all">{result.error}</p>
        </div>
      )}

      {/* Data table */}
      {result.available && !result.error && result.rows.length > 0 && (
        <div className="max-h-64 overflow-y-auto">
          <ResultTable result={result} />
        </div>
      )}
      {result.available && !result.error && result.rows.length === 0 && (
        <p className="p-6 text-[10px] text-[#a8abb3] italic">Query returned 0 rows.</p>
      )}
    </div>
  )
}

function HtapComparePanel() {
  // Default SQL uses bare table name — backend adds demo. prefix for Trino automatically
  const [compareSql, setCompareSql] = useState(
    'SELECT entity_id, speed_mps, altitude_m, risk_score\nFROM drone_latest_status\nWHERE is_flying = true ALLOW FILTERING\nLIMIT 10'
  )
  const [benchResult, setBenchResult] = useState<BenchmarkResponse | null>(null)
  const [benchError, setBenchError] = useState<string | null>(null)

  const compareMutation = useMutation({
    mutationFn: async () => {
      setBenchError(null)
      const resp = await fetch('/api/query/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: compareSql, limit: 10 }),
      })
      // Always parse JSON — the endpoint returns 200 even with engine errors
      const data = await resp.json()
      if (!resp.ok) {
        // Only throws on validation errors (bad SQL, forbidden keyword etc)
        throw new Error(data.detail || `HTTP ${resp.status}`)
      }
      return data as BenchmarkResponse
    },
    onSuccess: (data) => setBenchResult(data),
    onError: (err: Error) => setBenchError(err.message),
  })

  const casMs = benchResult?.cassandra?.query_time_ms
  const triMs = benchResult?.trino?.query_time_ms
  const spkMs = benchResult?.spark?.query_time_ms
  const cassOk = benchResult?.cassandra?.available && !benchResult.cassandra.error
  const trinoOk = benchResult?.trino?.available && !benchResult.trino.error
  const sparkOk = benchResult?.spark?.available && !benchResult.spark.error

  return (
    <div className="space-y-6">
      {/* SQL Editor */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="bg-[#1b2028] px-6 py-3 border-b border-white/5 flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#99f7ff]">HTAP.benchmark.sql</span>
          <span className="text-[10px] text-[#a8abb3] uppercase font-bold tracking-widest opacity-50">
            Single query · Three engines
          </span>
        </div>
        <textarea
          value={compareSql}
          onChange={(e) => setCompareSql(e.target.value)}
          className="h-[160px] w-full bg-transparent p-6 text-sm font-mono text-[#99f7ff] focus:outline-none resize-none leading-relaxed"
          spellCheck="false"
        />
      </div>

      {/* Run button */}
      <button
        onClick={() => compareMutation.mutate()}
        disabled={compareMutation.isPending}
        className="w-full bg-gradient-to-r from-[#99f7ff]/20 via-[#a78bfa]/20 to-[#feaa00]/20 hover:from-[#99f7ff]/30 hover:via-[#a78bfa]/30 hover:to-[#feaa00]/30 border border-white/10 text-white px-8 py-3 font-headline font-bold tracking-widest transition-all active:scale-95 rounded flex items-center justify-center gap-3 disabled:opacity-60"
      >
        {compareMutation.isPending ? (
          <><span className="material-symbols-outlined animate-spin" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span> BENCHMARKING ALL THREE ENGINES...</>
        ) : (
          <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>compare_arrows</span> RUN HTAP BENCHMARK — 3 ENGINES</>
        )}
      </button>

      {/* Validation error (bad SQL, forbidden keyword) */}
      {benchError && (
        <div className="bg-[#ff7162]/10 border border-[#ff7162]/30 p-4 rounded-lg flex items-start gap-3 text-[#ff7162]">
          <span className="material-symbols-outlined text-[18px] shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>error</span>
          <p className="text-xs font-bold">{benchError}</p>
        </div>
      )}

      {/* Per-engine results — 3 columns */}
      {benchResult && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EngineCard
            title="Cassandra — OLTP"
            sub="Latest-state point read"
            color="#99f7ff"
            result={benchResult.cassandra}
          />
          <EngineCard
            title="Presto / Trino — OLAP"
            sub="Analytical full-table scan"
            color="#feaa00"
            result={benchResult.trino}
          />
          <EngineCard
            title="Spark SQL — Batch Analytics"
            sub="Distributed in-memory compute"
            color="#a78bfa"
            result={benchResult.spark}
          />
        </div>
      )}

      {/* Speed delta insight — now covers all 3 engines */}
      {benchResult && (cassOk || trinoOk || sparkOk) && (
        <div className="glass-panel rounded-xl p-6 border border-white/5 space-y-4">
          <p className="text-[10px] font-bold text-[#a8abb3] uppercase tracking-widest text-center">HTAP Insight — Engine Comparison</p>

          {/* Speed bar chart */}
          {[{ label: 'Cassandra (OLTP)', ms: casMs, ok: cassOk, color: '#99f7ff' },
            { label: 'Presto / Trino (OLAP)', ms: triMs, ok: trinoOk, color: '#feaa00' },
            { label: 'Spark SQL (Batch)', ms: spkMs, ok: sparkOk, color: '#a78bfa' },
          ].map(({ label, ms, ok, color }) => {
            const maxMs = Math.max(casMs ?? 0, triMs ?? 0, spkMs ?? 0, 1)
            const pct = ok && ms !== undefined ? Math.max(2, (ms / maxMs) * 100) : 0
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span style={{ color }}>{label}</span>
                  <span className="text-[#a8abb3]">
                    {ok && ms !== undefined ? `${ms.toFixed(0)} ms` : 'unavailable'}
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color, opacity: ok ? 1 : 0.2 }}
                  />
                </div>
              </div>
            )
          })}

          {/* Narrative */}
          <p className="text-sm text-[#a8abb3] leading-relaxed pt-2 border-t border-white/5">
            <span className="text-[#99f7ff] font-bold">Cassandra</span> wins for sub-millisecond point reads on the latest-state table.
            {' '}<span className="text-[#feaa00] font-bold">Presto/Trino</span> excels at analytical aggregations across historical event streams.
            {' '}<span className="text-[#a78bfa] font-bold">Spark SQL</span> provides distributed batch analytics and ML-ready data processing at scale.
          </p>
        </div>
      )}
    </div>
  )
}


// ──────────────────── Main Page ────────────────────
export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<'sql' | 'ai' | 'compare'>('sql')
  const [sql, setSql] = useState('SELECT * FROM demo.drone_latest_status LIMIT 10')
  const [aiQuery, setAiQuery] = useState('renewable energy and hydropower')
  const [engine, setEngine] = useState<'cassandra' | 'presto'>('cassandra')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [aiResults, setAiResults] = useState<VectorResult[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const queryMutation = useMutation<QueryResult, Error, { sql: string; limit: number; engine: string }>({
    mutationFn: async (req) => {
      const resp = await fetch('/api/query/sql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'Query failed') }
      return resp.json()
    },
    onSuccess: (data) => {
      setResult(data); setError(null)
      setQueryHistory((h) => [sql, ...h.filter((q) => q !== sql)].slice(0, 10))
      showToast(`${data.row_count} rows in ${data.query_time_ms.toFixed(0)}ms`, 'success')
    },
    onError: (err) => { setError(err.message); setResult(null) },
  })

  const aiSearchMutation = useMutation<AISearchResponse, Error, { query: string }>({
    mutationFn: async (req) => {
      const resp = await fetch('/api/vector/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'AI Search failed') }
      return resp.json()
    },
    onSuccess: (data) => {
      setAiResults(data.results ?? [])
      setAiSummary(data.summary ?? null)
      setError(null)
      showToast(`${data.results?.length ?? 0} semantic matches in ${Math.round(data.query_time_ms)}ms`, 'info')
    },
    onError: (err) => { setError(err.message); setAiResults([]) },
  })

  const indexingMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch('/api/vector/index-all', { method: 'POST' })
      return resp.json()
    },
    // ✅ FIX: No more alert() — uses inline toast
    onSuccess: () => showToast('Vector indexing started in background', 'info'),
    onError:   () => showToast('Failed to start indexing', 'error'),
  })

  const handleRun = () => {
    if (activeTab === 'sql') queryMutation.mutate({ sql, limit: 10, engine })
    else if (activeTab === 'ai') aiSearchMutation.mutate({ query: aiQuery })
  }

  const isPending = queryMutation.isPending || aiSearchMutation.isPending

  const TABS = [
    { key: 'sql', label: 'SQL Analyst', icon: 'terminal', color: 'text-[#99f7ff]' },
    { key: 'ai',  label: 'AI Context Search', icon: 'neurology', color: 'text-[#feaa00]' },
    { key: 'compare', label: 'HTAP Compare', icon: 'compare_arrows', color: 'text-white' },
  ] as const

  return (
    <section className="space-y-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse" />
            <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">HTAP Exploratory Engine</span>
          </div>
          <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] uppercase">Explore</h1>
        </div>
        <div className="flex gap-4">
          {activeTab === 'ai' && (
            <button
              onClick={() => indexingMutation.mutate()}
              disabled={indexingMutation.isPending}
              className="bg-[#feaa00]/10 border border-[#feaa00]/30 text-[#feaa00] px-4 py-2 rounded text-xs font-black uppercase tracking-widest hover:bg-[#feaa00]/20 transition-all flex items-center gap-2"
            >
              <MaterialIcon name="refresh" className={indexingMutation.isPending ? 'animate-spin' : ''} />
              Sync AI Data
            </button>
          )}
          {activeTab === 'sql' && queryHistory.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="bg-[#151a21] border border-white/5 px-4 py-2 rounded text-xs font-black uppercase tracking-widest text-[#a8abb3] hover:text-[#99f7ff] transition-all flex items-center gap-2"
            >
              <MaterialIcon name="history" /> History ({queryHistory.length})
            </button>
          )}
          <div className="bg-[#151a21] border border-white/5 px-4 py-2 rounded flex items-center gap-3">
            <MaterialIcon name="bolt" className="text-[#feaa00] text-xl" />
            <span className="text-xs font-bold text-[#a8abb3] uppercase tracking-widest">Low Latency Core</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#151a21] p-1 rounded-xl w-fit border border-white/5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setResult(null); setAiResults([]); setError(null) }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.key ? `bg-[#20262f] ${tab.color} shadow-xl` : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MaterialIcon name={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Compare tab has its own layout */}
      {activeTab === 'compare' ? (
        <HtapComparePanel />
      ) : (
        <>
          {/* Query History Dropdown */}
          {showHistory && queryHistory.length > 0 && (
            <div className="bg-[#151a21] border border-white/5 rounded-xl overflow-hidden">
              <div className="px-6 py-3 border-b border-white/5">
                <p className="text-[10px] font-black text-[#a8abb3] uppercase tracking-widest">Recent Queries</p>
              </div>
              {queryHistory.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setSql(q); setShowHistory(false) }}
                  className="w-full text-left px-6 py-3 text-xs font-mono text-[#99f7ff] hover:bg-white/5 transition-colors border-b border-white/[0.03] truncate"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Editor & Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 space-y-4">
              <div className={`glass-panel rounded-xl overflow-hidden flex flex-col transition-all border ${activeTab === 'ai' ? 'border-[#feaa00]/20' : 'border-white/5'}`}>
                <div className="bg-[#1b2028] px-6 py-3 border-b border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${activeTab === 'ai' ? 'text-[#feaa00]' : 'text-[#99f7ff]'}`}>
                      {activeTab === 'sql' ? 'Console.sql' : 'SmartQuery.rag'}
                    </span>
                    {activeTab === 'sql' && (
                      <div className="flex bg-black/40 rounded p-0.5">
                        {(['cassandra', 'presto'] as const).map((eng) => (
                          <button key={eng}
                            onClick={() => setEngine(eng)}
                            className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all rounded ${engine === eng ? 'bg-[#99f7ff] text-[#005f64]' : 'text-[#a8abb3] hover:text-[#99f7ff]'}`}
                          >
                            {eng === 'cassandra' ? 'Cassandra' : 'Presto'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-[#a8abb3] uppercase font-bold tracking-widest opacity-50">
                    {activeTab === 'sql' ? 'Query Editor' : 'Natural Language Input'}
                  </span>
                </div>

                {activeTab === 'sql' ? (
                  <textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    className="h-[250px] bg-transparent p-6 text-sm font-mono text-[#99f7ff] focus:outline-none resize-none leading-relaxed"
                    spellCheck="false"
                  />
                ) : (
                  <div className="p-10 text-center space-y-4 bg-gradient-to-b from-[#feaa00]/5 to-transparent">
                    <h3 className="font-headline font-bold text-[#feaa00] uppercase tracking-widest">Semantic Vector Search</h3>
                    <div className="relative max-w-2xl mx-auto">
                      <input
                        type="text"
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                        placeholder="e.g. renewable energy and climate change..."
                        className="w-full bg-[#151a21] border border-white/10 rounded-full px-8 py-5 text-[#f1f3fc] text-lg focus:outline-none focus:border-[#feaa00]/50 transition-all shadow-2xl"
                      />
                      <MaterialIcon name="auto_awesome" className="absolute right-6 top-1/2 -translate-y-1/2 text-[#feaa00]" />
                    </div>
                    <p className="text-[10px] text-[#a8abb3] font-medium max-w-md mx-auto leading-relaxed">
                      Each monitored asset carries a text snippet drawn from a diverse corpus (history, science, finance, urban planning…).
                      Vector search finds assets whose snippets are semantically closest to your query — this is <em>text similarity</em>, not geographic proximity.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                      {[
                        'sovereign wealth fund',
                        'quantum computing breakthroughs',
                        'Norse seafarers Viking Age',
                        'hydropower renewable energy',
                        'behavioural economics Nobel',
                        'genome DNA sequencing',
                      ].map((hint) => (
                        <button
                          key={hint}
                          onClick={() => setAiQuery(hint)}
                          className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-[#feaa00]/20 text-[#feaa00]/70 hover:border-[#feaa00]/60 hover:text-[#feaa00] transition-all"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center bg-[#151a21]/50 p-4 rounded-lg border border-white/5">
                <div className="flex gap-4">
                  <button
                    onClick={handleRun}
                    disabled={isPending}
                    className={`${activeTab === 'sql' ? 'bg-[#99f7ff]' : 'bg-[#feaa00]'} hover:brightness-110 disabled:opacity-50 text-[#005f64] px-8 py-2.5 rounded font-headline font-bold tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-xl`}
                  >
                    <MaterialIcon name={isPending ? 'sync' : 'rocket_launch'} className={isPending ? 'animate-spin' : ''} />
                    {isPending ? 'SEARCHING...' : 'EXECUTE'}
                  </button>
                </div>
                <div className="text-[10px] font-bold text-[#a8abb3] uppercase tracking-[0.2em] opacity-60">
                  {activeTab === 'sql' ? 'Top 10 records' : 'Best semantic matches'}
                </div>
              </div>
            </div>

            {/* Sidebar Info */}
            <div className="space-y-6">
              <div className={`glass-panel p-6 rounded-xl border-l-4 ${activeTab === 'ai' ? 'border-l-[#feaa00]' : 'border-l-[#99f7ff]'}`}>
                <h3 className="text-sm font-black text-[#f1f3fc] uppercase tracking-wider mb-4">Schema Context</h3>
                <div className="space-y-4">
                  <div>
                    <span className={`text-[10px] font-bold block mb-1 ${activeTab === 'ai' ? 'text-[#feaa00]' : 'text-[#99f7ff]'}`}>
                      {activeTab === 'sql' ? 'demo.drone_latest_status' : 'Vector Architecture'}
                    </span>
                    <ul className="text-[10px] text-[#a8abb3] leading-5 font-medium list-disc list-inside">
                      <li>entity_id (ID)</li>
                      <li>is_flying (FLAG)</li>
                      {activeTab === 'sql' ? (
                        <>
                          <li>speed_mps (DOUBLE)</li>
                          <li>altitude_m (FLOAT)</li>
                          <li>risk_score (DOUBLE)</li>
                        </>
                      ) : (
                        <>
                          <li className="text-[#feaa00]">text_payload (SOURCE)</li>
                          <li className="text-[#feaa00]">payload_vector (VECTOR)</li>
                          <li>Distance: Cosine Similarity</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
              <div className="glass-panel p-6 rounded-xl border-l-4 border-l-slate-600">
                <h3 className="text-sm font-black text-[#f1f3fc] uppercase tracking-wider mb-2">How It Works</h3>
                <p className="text-[10px] text-[#a8abb3] leading-relaxed">
                  {activeTab === 'sql'
                    ? 'Perform traditional HTAP queries across real-time telemetry and historical event streams.'
                    : 'Each asset carries a text snippet on an unrelated topic. Your query is embedded and compared against those snippets using cosine similarity — closest semantic meaning wins.'}
                </p>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MaterialIcon name={activeTab === 'ai' ? 'neurology' : 'database'} className={activeTab === 'ai' ? 'text-[#feaa00]' : 'text-[#99f7ff]'} />
              <h2 className="text-xl font-headline font-bold uppercase tracking-tight">
                {activeTab === 'ai' ? 'Semantic Results' : 'Dataset Preview'}
              </h2>
              {(result || aiResults.length > 0) && (
                <span className="text-[10px] font-bold text-[#a8abb3] bg-white/5 px-2 py-0.5 rounded tracking-tighter">
                  {activeTab === 'ai' ? `${aiResults.length} matches` : `${result?.query_time_ms?.toFixed(0)}ms | ${result?.row_count} rows`}
                </span>
              )}
            </div>

            {/* AI Narrative Summary */}
            {activeTab === 'ai' && aiSummary && (
              <div className="bg-gradient-to-r from-[#feaa00]/10 to-transparent border border-[#feaa00]/20 rounded-xl p-6 flex gap-4">
                <MaterialIcon name="auto_awesome" className="text-[#feaa00] text-2xl shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-[#feaa00] uppercase tracking-widest mb-2">AI Narrative</p>
                  <p className="text-sm text-[#f1f3fc] leading-relaxed">{aiSummary}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-[#ff7162]/10 border border-[#ff7162]/30 p-4 rounded text-[#ff7162] text-xs font-bold flex items-center gap-3">
                <MaterialIcon name="error" /> {error}
              </div>
            )}

            <div className="glass-panel rounded-xl overflow-hidden border border-white/5 bg-[#0d121a]">
              {!result && aiResults.length === 0 && !error && !isPending && (
                <div className="p-20 text-center opacity-30">
                  <MaterialIcon name="cloud_sync" className="text-8xl mb-4" />
                  <p className="text-[#a8abb3] font-medium italic">Waiting for execution context...</p>
                </div>
              )}
              {isPending && (
                <div className="p-20 flex flex-col items-center justify-center">
                  <div className={`w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6 ${activeTab === 'ai' ? 'border-[#feaa00]' : 'border-[#99f7ff]'}`} />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Calculating Result Set</p>
                </div>
              )}
              {activeTab === 'ai' && aiResults.length > 0 && <AIResultCards results={aiResults} />}
              {activeTab === 'sql' && result && result.rows.length > 0 && <ResultTable result={result} />}
              {activeTab === 'ai' && !isPending && aiResults.length === 0 && aiSearchMutation.isSuccess && (
                <div className="p-12 text-center opacity-40">
                  <p className="text-[#a8abb3] font-medium">No semantic matches found for that query.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}