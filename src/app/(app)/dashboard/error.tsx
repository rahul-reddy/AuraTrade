'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const message =
    isDevelopment && error.message
      ? error.message
      : 'We hit a problem while loading the dashboard.'

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground flex items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
        <h1 className="text-xl font-semibold">Dashboard error</h1>
        <p className="mt-2 text-sm text-zinc-400">{message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
