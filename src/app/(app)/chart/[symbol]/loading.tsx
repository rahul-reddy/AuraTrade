import { Skeleton } from "@/components/ui/skeleton";

export default function SymbolChartLoading() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-md bg-zinc-800" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 bg-zinc-800" />
            <Skeleton className="h-3 w-28 bg-zinc-800" />
          </div>
        </div>
        <Skeleton className="h-9 w-32 bg-zinc-800" />
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
          <Skeleton className="h-6 w-44 bg-zinc-800" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-14 bg-zinc-800" />
            ))}
          </div>
          <Skeleton className="h-4 w-[38rem] bg-zinc-800" />
          <Skeleton className="h-16 w-full bg-zinc-800" />
        </div>

        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <Skeleton className="h-3 w-20 mb-2 bg-zinc-800" />
              <Skeleton className="h-6 w-24 bg-zinc-800" />
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-3">
          <Skeleton className="h-5 w-32 bg-zinc-800" />
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full bg-zinc-800" />
          ))}
        </div>
      </div>
    </div>
  );
}
