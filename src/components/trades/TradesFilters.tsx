'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'

interface TradesFiltersProps {
  initialSymbol?: string
  initialDirection?: string
  initialStatus?: string
  initialDateFrom?: string
  initialDateTo?: string
  /** Stringified current params — used as React key to reset on server navigation */
  filterKey: string
}

export function TradesFilters({
  initialSymbol,
  initialDirection,
  initialStatus,
  initialDateFrom,
  initialDateTo,
}: TradesFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasFilters =
    initialSymbol || initialDirection || initialStatus || initialDateFrom || initialDateTo

  function submitDebounced() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      formRef.current?.requestSubmit()
    }, 400)
  }

  function submitImmediate() {
    formRef.current?.requestSubmit()
  }

  function handleExport() {
    if (!formRef.current) return
    const data = new FormData(formRef.current)
    const p = new URLSearchParams()
    for (const [key, value] of data.entries()) {
      if (typeof value === 'string' && value) p.set(key, value)
    }
    p.set('export', 'true')
    window.location.href = `/api/trades?${p.toString()}`
  }

  return (
    <form
      ref={formRef}
      method="GET"
      action="/trades"
      className="flex flex-wrap items-center gap-2 mb-4"
    >
      <Input
        name="symbol"
        defaultValue={initialSymbol ?? ''}
        onChange={submitDebounced}
        placeholder="Symbol"
        className="w-32 h-8 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500 text-sm font-mono uppercase"
        autoComplete="off"
      />

      <select
        name="direction"
        defaultValue={initialDirection ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">All Directions</option>
        <option value="LONG">Long</option>
        <option value="SHORT">Short</option>
      </select>

      <select
        name="status"
        defaultValue={initialStatus ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">All Status</option>
        <option value="closed">Closed</option>
        <option value="open">Open</option>
      </select>

      <input
        type="date"
        name="dateFrom"
        defaultValue={initialDateFrom ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark]"
      />
      <span className="text-zinc-600 text-sm">–</span>
      <input
        type="date"
        name="dateTo"
        defaultValue={initialDateTo ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark]"
      />

      {hasFilters && (
        <a
          href="/trades"
          className="h-8 px-3 flex items-center text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors"
        >
          Clear
        </a>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={handleExport}
        className="h-8 px-3 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
      >
        Export CSV
      </button>
    </form>
  )
}
