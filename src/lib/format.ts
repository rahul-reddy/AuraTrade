/** Format a dollar amount. When signed=true (default), prefix with + or -. */
export function formatCurrency(
  n: number | null | undefined,
  opts: { signed?: boolean } = {},
): string {
  if (n == null) return '—'
  const { signed = true } = opts
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!signed) return `$${formatted}`
  if (n > 0) return `+$${formatted}`
  if (n < 0) return `-$${formatted}`
  return `$${formatted}` // zero
}

/** Format a price with up to 4 decimal places. */
export function formatPrice(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

/** Format duration in seconds to human-readable string. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds === 0) return 'intraday'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return '< 1m'
}

/** Format a Date to "Mar 13, 2026" style. */
/** A yyyy-MM-dd trading day, shown as that calendar day in every time zone. */
export function formatTradingDay(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
