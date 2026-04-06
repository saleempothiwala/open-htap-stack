export default function MapPage() {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">Live Operations</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Drone Map</h1>
      <div className="glass-panel rounded-xl overflow-hidden" style={{ height: '70vh' }}>
        <div className="w-full h-full flex items-center justify-center text-[#a8abb3]">
          <div className="text-center">
            <span className="material-symbols-outlined text-[#99f7ff] text-6xl mb-4">map</span>
            <p className="font-headline text-lg font-bold uppercase tracking-wide">Interactive Map</p>
            <p className="text-sm mt-2">Leaflet map with live drone positions coming next</p>
          </div>
        </div>
      </div>
    </section>
  )
}