export default function AlertsPage() {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#ff7162] animate-pulse"></span>
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#ff7162] font-bold">Incident Stream</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Alerts</h1>
      <div className="glass-panel rounded-xl p-8">
        <div className="text-center text-[#a8abb3]">
          <span className="material-symbols-outlined text-[#ff7162] text-6xl mb-4">warning</span>
          <p className="font-headline text-lg font-bold uppercase tracking-wide">Alert Stream</p>
          <p className="text-sm mt-2">Live alert feed with filtering and acknowledgment coming next</p>
        </div>
      </div>
    </section>
  )
}