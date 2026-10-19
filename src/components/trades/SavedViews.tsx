'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useBrowserSetting } from '@/components/providers/useBrowserSetting'
import { parseSavedViews, safeViewQuery, savedViewHref } from '@/lib/journal/saved-views'

export default function SavedViews({ accountId }: { accountId: string }) {
  const params = useSearchParams()
  const [raw, set] = useBrowserSetting(`auratrade-saved-views-${accountId}`, '[]')
  const views = parseSavedViews(raw)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  function save(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const next = views.filter(view => view.name !== name.trim())
    if (next.length >= 12) { setMessage('Remove a saved view before adding another (maximum 12).'); return }
    const persisted = set(JSON.stringify([...next, { name: name.trim(), query: safeViewQuery(params.toString()) }]))
    setName(''); setMessage(persisted ? 'View saved in this browser.' : 'Browser storage is unavailable. This view is available for this tab’s session only.')
  }
  return <details className="surface p-4"><summary className="cursor-pointer text-xs font-medium">Saved views · this browser ({views.length}/12)</summary><div className="mt-4 space-y-3"><form onSubmit={save} className="flex flex-wrap items-end gap-3"><label className="journal-label">Name this filter view<input className="journal-field mt-1" maxLength={60} required value={name} onChange={event => setName(event.target.value)} /></label><button className="action-secondary">Save current view</button></form><p role="status" className="text-xs text-muted-foreground">{message}</p><ul className="flex flex-wrap gap-2">{views.map(view => <li key={view.name} className="flex items-center rounded border border-border text-xs"><Link className="px-3 py-2 text-primary hover:bg-muted" href={savedViewHref(accountId, view.query)}>{view.name}</Link><button aria-label={`Delete saved view ${view.name}`} className="border-l border-border px-2 py-2 text-muted-foreground" onClick={() => { const persisted = set(JSON.stringify(views.filter(item => item.name !== view.name))); setMessage(persisted ? 'Saved view removed.' : 'Removed for this tab’s session; browser storage is unavailable.') }}>×</button></li>)}</ul></div></details>
}
