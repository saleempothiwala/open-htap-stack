export default function ExplorePage() {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-2 h-2 rounded-full bg-[#99f7ff] animate-pulse"></span>
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-[#00e2ee] font-bold">Query Engine</span>
      </div>
      <h1 className="text-4xl font-headline font-black tracking-tighter text-[#f1f3fc] mb-6 uppercase">Explore</h1>
      <div className="glass-panel rounded-xl p-8">
        <div className="text-center text-[#a8abb3]">
          <span className="material-symbols-outlined text-[#99f7ff] text-6xl mb-4">search</span>
          <p className="font-headline text-lg font-bold uppercase tracking-wide">SQL & Natural Language Query</p>
          <p className="text-sm mt-2">SQL editor with syntax highlighting and NL-to-SQL coming next</p>
        </div>
      </div>
    </section>
  )
}