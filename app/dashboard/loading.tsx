export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 space-y-7 animate-pulse">
      {/* Top Bar / Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="space-y-2">
          <div className="w-56 h-8 rounded-lg bg-muted/60" />
          <div className="w-80 h-4 rounded-md bg-muted/40" />
        </div>
        <div className="w-36 h-10 rounded-xl bg-muted/50" />
      </div>

      {/* 4 Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={`dash-skel-${i}`} className="p-4 sm:p-5 rounded-2xl border border-border/60 bg-card/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-24 h-4 rounded bg-muted/60" />
              <div className="w-8 h-8 rounded-lg bg-muted/40" />
            </div>
            <div className="w-20 h-7 rounded-lg bg-muted/70" />
            <div className="w-32 h-3 rounded bg-muted/30" />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="space-y-4 pt-2">
        <div className="w-48 h-6 rounded-lg bg-muted/60" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={`card-skel-${i}`} className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
              <div className="w-28 h-4 rounded bg-muted/50" />
              <div className="w-full h-12 rounded-xl bg-muted/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
