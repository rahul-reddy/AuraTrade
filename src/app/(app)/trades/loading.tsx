import { Skeleton } from '@/components/ui/skeleton'

export default function TradesLoading() {
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center gap-6">
        <Skeleton className="h-5 w-28 bg-zinc-800" />
        <Skeleton className="h-4 w-48 bg-zinc-800" />
      </div>

      <div className="px-8 py-6">
        {/* Page header */}
        <div className="mb-6">
          <Skeleton className="h-8 w-44 mb-2 bg-zinc-800" />
          <Skeleton className="h-4 w-32 bg-zinc-800" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <Skeleton className="h-3 w-16 mb-2 bg-zinc-800" />
              <Skeleton className="h-6 w-24 bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-32 bg-zinc-800" />
          <Skeleton className="h-8 w-32 bg-zinc-800" />
          <Skeleton className="h-8 w-28 bg-zinc-800" />
          <Skeleton className="h-8 w-28 bg-zinc-800" />
          <Skeleton className="h-8 w-36 bg-zinc-800" />
          <Skeleton className="h-8 w-4 bg-zinc-800" />
          <Skeleton className="h-8 w-36 bg-zinc-800" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28 bg-zinc-800" />
          <Skeleton className="h-8 w-24 bg-zinc-800" />
        </div>

        {/* Table skeleton */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-4">
            {[14, 8, 24, 24, 16, 16, 12, 20, 12, 16, 20, 12].map((w, i) => (
              <Skeleton key={i} className={`h-3 w-${w} bg-zinc-800`} />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4"
              style={{ opacity: 1 - i * 0.04 }}
            >
              <Skeleton className="h-4 w-14 bg-zinc-800" />
              <Skeleton className="h-5 w-6 bg-zinc-800" />
              <Skeleton className="h-4 w-24 bg-zinc-800" />
              <Skeleton className="h-4 w-24 bg-zinc-800" />
              <Skeleton className="h-4 w-16 bg-zinc-800 ml-auto" />
              <Skeleton className="h-4 w-16 bg-zinc-800" />
              <Skeleton className="h-4 w-10 bg-zinc-800" />
              <Skeleton className="h-4 w-20 bg-zinc-800" />
              <Skeleton className="h-4 w-10 bg-zinc-800" />
              <Skeleton className="h-4 w-14 bg-zinc-800" />
              <Skeleton className="h-5 w-20 bg-zinc-800" />
              <Skeleton className="h-7 w-12 bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
