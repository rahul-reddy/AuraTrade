'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function IntegrityError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-100">Integrity page failed to load</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Something went wrong while opening the repair workspace. Try again, or return to the
          dashboard and reopen it.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-zinc-600">Error ID: {error.digest}</p>}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            Retry
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
