'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'

interface TradesFiltersProps {
  accountId?: string
  initialSymbol?: string
  initialDirection?: string
  initialStatus?: string
  initialSetup?: string
  initialDateFrom?: string
  initialDateTo?: string
  initialPageSize?: number
  /** Stringified current params — used as React key to reset on server navigation */
  filterKey: string
}

export function TradesFilters({
  accountId,
  initialSymbol,
  initialDirection,
  initialStatus,
  initialSetup,
  initialDateFrom,
  initialDateTo,
  initialPageSize = 50,
}: TradesFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasFilters =
    initialSymbol ||
    initialDirection ||
    initialStatus ||
    initialSetup ||
    initialDateFrom ||
    initialDateTo

  const clearParams = new URLSearchParams()
  if (accountId) clearParams.set('accountId', accountId)
  if (initialPageSize !== 50) clearParams.set('pageSize', String(initialPageSize))
  const clearQuery = clearParams.toString()
  const clearHref = clearQuery ? `/trades?${clearQuery}` : '/trades'

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
      aria-label="Filter trade history"
      className="filter-bar flex flex-wrap items-center gap-2 mb-4"
    >
      {accountId && <input type="hidden" name="accountId" value={accountId} />}

      <Input
        aria-label="Search symbol"
        name="symbol"
        defaultValue={initialSymbol ?? ''}
        onChange={submitDebounced}
        placeholder="Symbol"
        className="w-32 h-8 bg-zinc-900 border-zinc-700 text-foreground placeholder:text-zinc-500 focus:border-primary text-sm font-mono uppercase"
        autoComplete="off"
      />

      <select
        aria-label="Direction"
        name="direction"
        defaultValue={initialDirection ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-primary"
      >
        <option value="">All Directions</option>
        <option value="LONG">Long</option>
        <option value="SHORT">Short</option>
      </select>

      <select
        aria-label="Trade status"
        name="status"
        defaultValue={initialStatus ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-primary"
      >
        <option value="">All Status</option>
        <option value="closed">Closed</option>
        <option value="open">Open</option>
      </select>

      <Input
        aria-label="Setup"
        name="setup"
        defaultValue={initialSetup ?? ''}
        onChange={submitDebounced}
        placeholder="Setup"
        className="w-32 h-8 bg-zinc-900 border-zinc-700 text-foreground placeholder:text-zinc-500 focus:border-primary text-sm uppercase"
        autoComplete="off"
      />

      <input
        type="date"
        aria-label="Entry date from"
        name="dateFrom"
        defaultValue={initialDateFrom ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-primary"
      />
      <span className="text-zinc-600 text-sm">–</span>
      <input
        type="date"
        aria-label="Entry date to"
        name="dateTo"
        defaultValue={initialDateTo ?? ''}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-primary"
      />

      {hasFilters && (
        <a
          href={clearHref}
          className="h-8 px-3 flex items-center text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors"
        >
          Clear
        </a>
      )}

      <div className="flex-1" />

      <select
        aria-label="Trades per page"
        name="pageSize"
        defaultValue={String(initialPageSize)}
        onChange={submitImmediate}
        className="h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm focus:outline-none focus:border-primary"
      >
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
        <option value="200">200 / page</option>
      </select>

      <button
        type="button"
        onClick={handleExport}
        className="h-8 px-3 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-foreground transition-colors"
      >
        Export CSV
      </button>
    </form>
  )
}
