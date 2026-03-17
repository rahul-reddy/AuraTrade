export default function IntegrityLoading() {
  return (
    <div className="mx-auto max-w-[1680px] px-8 py-6">
      <div className="mb-6 h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/80" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/80"
          />
        ))}
      </div>
    </div>
  )
}
