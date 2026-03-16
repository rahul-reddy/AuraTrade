import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Skeleton className="h-6 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-48 bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-36 bg-zinc-800" />
      </div>

      <div className="px-8 py-6 max-w-[1680px] mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-56 mb-2 bg-zinc-800" />
          <Skeleton className="h-4 w-72 bg-zinc-800" />
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <Skeleton className="h-10 w-36 bg-zinc-800" />
          <Skeleton className="h-10 w-36 bg-zinc-800" />
          <Skeleton className="h-10 w-28 bg-zinc-800" />
          <Skeleton className="h-10 w-24 bg-zinc-800" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
            >
              <Skeleton className="h-3 w-24 mb-3 bg-zinc-800" />
              <Skeleton className="h-8 w-32 mb-2 bg-zinc-800" />
              <Skeleton className="h-3 w-28 bg-zinc-800" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <Skeleton className="h-4 w-44 mb-4 bg-zinc-800" />
            <Skeleton className="h-[320px] w-full bg-zinc-800" />
          </div>
          <div className="xl:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <Skeleton className="h-4 w-36 mb-4 bg-zinc-800" />
            <Skeleton className="h-[320px] w-full bg-zinc-800" />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="xl:col-span-6 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5"
            >
              <Skeleton className="h-4 w-40 mb-4 bg-zinc-800" />
              <Skeleton className="h-[260px] w-full bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
