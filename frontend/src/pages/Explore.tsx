import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

interface QueryResult {
  columns: string[]
  rows: any[][]
  row_count: number
  query_time_ms: number
}

interface QueryRequest {
  sql: string
  limit: number
  engine: string
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
      {name}
    </span>
  )
}

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<'sql' | 'ai'>('sql')
  const [sql, setSql] = useState('SELECT * FROM demo.drone_latest_status LIMIT 10')
  const [aiQuery, setAiQuery] = useState('Which drones are near airports?')
  const [engine, setEngine] = useState<'cassandra' | 'presto'>('cassandra')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const queryMutation = useMutation<QueryResult, Error, QueryRequest>({
    mutationFn: async (req) => {
      const resp = await fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!resp.ok) {
        const errData = await resp.json()
        throw new Error(errData.detail || 'Query failed')
      }
      return resp.json()
    },
    onSuccess: (data) => {
      setResult(data)
      setError(null)
    },
    onError: (err) => {
      setError(err.message)
      setResult(null)
    },
  })

  const aiSearchMutation = useMutation<any, Error, { query: string }>({
    mutationFn: async (req) => {
      const resp = await fetch('/api/vector/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!resp.ok) {
        const errData = await resp.json()
        throw new Error(errData.detail || 'AI Search failed')
      }
      return resp.json()
    },
    onSuccess: (data) => {
      // Transform vector results to ResultTable format
      if (data.results && data.results.length > 0) {
        const columns = Object.keys(data.results[0])
        const rows = data.results.map((r: any) => columns.map(c => r[c]))
        setResult({
          columns,
          rows,
          row_count: data.results.length,
          query_time_ms: Math.round(data.query_time_ms)
        })
      } else {
        setResult({ columns: [], rows: [], row_count: 0, query_time_ms: 0 })
      }
      setError(null)
    },
    onError: (err) => {
      setError(err.message)
      setResult(null)
    },
  })

  const indexingMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch('/api/vector/index-all', { method: 'POST' })
      return resp.json()
    },
    onSuccess: (data) => {
      alert(`Successfully indexed ${data.indexed_count} drones for Vector Search!`)
    }
  })

  const handleRun = () => {
    if (activeTab === 'sql') {
      queryMutation.mutate({ sql, limit: 10, engine })
    } else {
      aiSearchMutation.mutate({ query: aiQuery })
    }
  }

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
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
               <MaterialIcon name="refresh" className={indexingMutation.isPending ? "animate-spin" : ""} />
               Sync AI Data
             </button>
           )}
          <div className="bg-[#151a21] border border-white/5 px-4 py-2 rounded flex items-center gap-3">
             <MaterialIcon name="bolt" className="text-[#feaa00] text-xl" />
             <span className="text-xs font-bold text-[#a8abb3] uppercase tracking-widest">Low Latency Core</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#151a21] p-1 rounded-xl w-fit self-start border border-white/5">
        <button 
          onClick={() => { setActiveTab('sql'); setResult(null); }}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'sql' ? 'bg-[#20262f] text-[#99f7ff] shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <MaterialIcon name="terminal" />
          SQL Analyst
        </button>
        <button 
          onClick={() => { setActiveTab('ai'); setResult(null); }}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-[#20262f] text-[#feaa00] shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <MaterialIcon name="neurology" />
          AI Context Search
        </button>
      </div>

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
                      <button 
                        onClick={() => setEngine('cassandra')}
                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all rounded ${engine === 'cassandra' ? 'bg-[#99f7ff] text-[#005f64]' : 'text-[#a8abb3] hover:text-[#99f7ff]'}`}
                      >
                        Cassandra
                      </button>
                      <button 
                        onClick={() => setEngine('presto')}
                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all rounded ${engine === 'presto' ? 'bg-[#99f7ff] text-[#005f64]' : 'text-[#a8abb3] hover:text-[#99f7ff]'}`}
                      >
                        Presto
                      </button>
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
                        placeholder="e.g. Find drones monitoring environmental hazards..."
                        className="w-full bg-[#151a21] border border-white/10 rounded-full px-8 py-5 text-[#f1f3fc] text-lg focus:outline-none focus:border-[#feaa00]/50 transition-all shadow-2xl"
                      />
                      <MaterialIcon name="auto_awesome" className="absolute right-6 top-1/2 -translate-y-1/2 text-[#feaa00]" />
                   </div>
                   <p className="text-[10px] text-[#a8abb3] font-medium max-w-md mx-auto leading-relaxed">
                      Powered by Vector Embeddings in Cassandra 5.0. This search looks for meaning and context across thousands of drone mission status logs.
                   </p>
                </div>
             )}
          </div>
          
          <div className="flex justify-between items-center bg-[#151a21]/50 p-4 rounded-lg border border-white/5">
             <div className="flex gap-4">
                <button 
                  onClick={handleRun}
                  disabled={queryMutation.isPending || aiSearchMutation.isPending}
                  className={`${activeTab === 'sql' ? 'bg-[#99f7ff]' : 'bg-[#feaa00]'} hover:brightness-110 disabled:opacity-50 text-[#005f64] px-8 py-2.5 rounded font-headline font-bold tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-xl`}
                >
                  <MaterialIcon name={(queryMutation.isPending || aiSearchMutation.isPending) ? "sync" : "rocket_launch"} className={(queryMutation.isPending || aiSearchMutation.isPending) ? "animate-spin" : ""} />
                  { (queryMutation.isPending || aiSearchMutation.isPending) ? "SEARCHING..." : "EXECUTE" }
                </button>
             </div>
             <div className="text-[10px] font-bold text-[#a8abb3] uppercase tracking-[0.2em] opacity-60">
                {activeTab === 'sql' ? 'Top 10 records' : 'Best semantic matches'}
             </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
           <div className={`glass-panel p-6 rounded-xl border-l-4 transition-all ${activeTab === 'ai' ? 'border-l-[#feaa00]' : 'border-l-[#99f7ff]'}`}>
              <h3 className="text-sm font-black text-[#f1f3fc] uppercase tracking-wider mb-4">Schema Context</h3>
              <div className="space-y-4">
                 <div>
                    <span className={`text-[10px] font-bold block mb-1 ${activeTab === 'ai' ? 'text-[#feaa00]' : 'text-[#99f7ff]'}`}>
                      { activeTab === 'sql' ? 'demo.drone_latest_status' : 'Vector Architecture' }
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

           <div className={`glass-panel p-6 rounded-xl border-l-4 border-l-slate-600`}>
              <h3 className="text-sm font-black text-[#f1f3fc] uppercase tracking-wider mb-2">Capabilities</h3>
              <p className="text-[10px] text-[#a8abb3] leading-relaxed">
                 {activeTab === 'sql' 
                   ? 'Perform traditional HTAP queries across real-time telemetry and historical event streams.' 
                   : 'Leverage RAG patterns to query the database using natural language and conceptual meaning.'}
              </p>
           </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <MaterialIcon name="database" className="text-[#99f7ff]" />
          <h2 className="text-xl font-headline font-bold uppercase tracking-tight">Dataset Preview</h2>
          {result && (
            <span className="text-[10px] font-bold text-[#a8abb3] bg-white/5 px-2 py-0.5 rounded tracking-tighter">
              {result.query_time_ms}ms | {result.row_count} rows
            </span>
          )}
        </div>

        {error && (
          <div className="bg-[#ff7162]/10 border border-[#ff7162]/30 p-4 rounded text-[#ff7162] text-xs font-bold flex items-center gap-3">
             <MaterialIcon name="error" />
             {error}
          </div>
        )}

        <div className="glass-panel rounded-xl overflow-hidden border border-white/5 bg-[#0d121a]">
          {!result && !error && !(queryMutation.isPending || aiSearchMutation.isPending) && (
             <div className="p-20 text-center opacity-30">
                <MaterialIcon name="cloud_sync" className="text-8xl mb-4" />
                <p className="text-[#a8abb3] font-medium italic">Waiting for execution context...</p>
             </div>
          )}

          {(queryMutation.isPending || aiSearchMutation.isPending) && (
             <div className="p-20 flex flex-col items-center justify-center">
                <div className={`w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6 ${activeTab === 'ai' ? 'border-[#feaa00]' : 'border-[#99f7ff]'}`}></div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Calculating Result Set</p>
             </div>
          )}

          {result && result.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20 border-b border-white/10">
                    {result.columns.map((col) => (
                      <th key={col} className="px-6 py-4 text-[10px] font-black text-[#99f7ff] uppercase tracking-widest">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                      {row.map((val, j) => (
                        <td key={j} className="px-6 py-4 text-xs font-medium text-[#f1f3fc] whitespace-normal max-w-md">
                          {typeof val === 'boolean' ? (val ? 'YES' : 'NO') : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}