const allowed = new Set(['symbol', 'direction', 'status', 'setup', 'dateFrom', 'dateTo', 'sortBy', 'sortDir', 'pageSize'])
export type SavedView = { name: string; query: string }
export function safeViewQuery(raw: string) {
  const result = new URLSearchParams()
  for (const [key, value] of new URLSearchParams(raw)) if (allowed.has(key) && value.length <= 150) result.set(key, value)
  return result.toString()
}
export function parseSavedViews(raw: string): SavedView[] {
  try {
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) return []
    return values.slice(0, 12).flatMap((value: unknown) => {
      if (!value || typeof value !== 'object' || !('name' in value) || !('query' in value) || typeof value.name !== 'string' || typeof value.query !== 'string' || value.name.length > 60 || !value.name.trim()) return []
      return [{ name: value.name, query: safeViewQuery(value.query) }]
    })
  } catch { return [] }
}
export function savedViewHref(accountId: string, query: string) {
  const params = new URLSearchParams(safeViewQuery(query)); params.set('accountId', accountId)
  return `/trades?${params}`
}
