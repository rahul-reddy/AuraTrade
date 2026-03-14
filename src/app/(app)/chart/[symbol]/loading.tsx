import { Skeleton } from "@/components/ui/skeleton";

export default function SymbolChartLoading() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-16 bg-zinc-800" />
          <div className="w-px h-4 bg-zinc-700" />
          <Skeleton className="h-6 w-20 bg-zinc-800" />
        </div>
        <div className="flex items-center gap-6">
          <Skeleton className="h-9 w-20 bg-zinc-800" />
          <Skeleton className="h-9 w-20 bg-zinc-800" />
          <Skeleton className="h-9 w-16 bg-zinc-800" />
        </div>
      </div>

      {/* Body skeleton */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900 p-3 space-y-2">
          <Skeleton className="h-5 w-28 bg-zinc-800 mb-3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-800/50 rounded p-3 space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20 bg-zinc-700" />
                <Skeleton className="h-3 w-10 bg-zinc-700" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24 bg-zinc-700" />
                <Skeleton className="h-3 w-14 bg-zinc-700" />
              </div>
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar skeleton */}
          <div className="h-10 border-b border-zinc-800 bg-zinc-950 px-3 flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-10 bg-zinc-800" />
            ))}
          </div>
          {/* Chart body skeleton */}
          <div className="flex-1 bg-zinc-950 flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 rounded-full border-2 border-blue-500/40 border-t-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-zinc-700 text-xs font-mono">Loading chart data…</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
