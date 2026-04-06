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

export default function HealthPage() {
  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ['platform-health'],
    queryFn: () => fetch('/api/platform/health').then((r) => r.json()),
    refetchInterval: 10000,
  })

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#10b981] font-bold">Infrastructure</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Platform Health</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <p className="text-[#a8abb3] col-span-full text-center py-12">Loading...</p>
        ) : (
          data?.services.map((svc) => (
            <div key={svc.name} className="bg-[#151a21] p-6 rounded-lg transition-all hover:bg-[#1b2028]">
              <div className="flex justify-between items-start mb-4">
                <span className="font-headline font-bold text-[#f1f3fc] uppercase text-sm tracking-tight">{svc.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-tighter ${
                  svc.status === 'up' ? 'text-[#10b981] bg-[#10b981]/10' : 'text-[#ff7162] bg-[#ff7162]/10'
                }`}>
                  {svc.status.toUpperCase()}
                </span>
              </div>
              <div className="mt-4 h-1 w-full bg-[#000000] rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${
                  svc.status === 'up' ? 'bg-[#10b981]' : 'bg-[#ff7162]'
                }`} style={{ width: svc.status === 'up' ? '100%' : '0%' }}></div>
              </div>
            </div>
          ))
        )}
      </div>

      {data && (
        <div className="mt-8 glass-panel p-8 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Overall Health Score</p>
              <p className="text-4xl font-headline font-bold text-[#99f7ff] mt-2">{Math.round(data.overall_health_score * 100)}%</p>
            </div>
            <div>
              <p className="text-[#a8abb3] text-[0.6875rem] uppercase tracking-[0.15em] font-medium">Total Drones</p>
              <p className="text-4xl font-headline font-bold text-[#99f7ff] mt-2">{data.total_drones}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}