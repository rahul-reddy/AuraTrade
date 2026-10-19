'use client'
import { useDraftNavigationGuard } from '@/components/providers/DraftNavigationGuard'

import { useEffect, useState } from 'react'
import type { DailyReviewDraft } from '@/lib/journal/contracts'

export default function DailyReflection({ initial, accountId, date, onSaved, onDirtyChange }: { initial: DailyReviewDraft; accountId: string; date: string; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  useDraftNavigationGuard(dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const response = await fetch('/api/review', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, date, ...draft }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not save this reflection. Please retry.')
      setDraft(previous => ({ ...previous, version: result.version })); setDirty(false); setSaved(true); onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this reflection.') } finally { setBusy(false) }
  }
  return <form onSubmit={save} aria-label="Daily reflection" className="surface p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Close the day with one lesson</h2><p className="mt-1 text-xs text-muted-foreground">Separate the quality of your decisions from the result.</p></div><span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : draft.reviewed ? 'Reviewed' : 'Not reviewed'}</span></div>
    <fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 lg:grid-cols-3">{([{ field: 'whatWorked', label: 'What worked?', placeholder: 'Decisions worth repeating' }, { field: 'toImprove', label: 'What needs work?', placeholder: 'A decision you would change' }, { field: 'nextFocus', label: 'One focus for next session', placeholder: 'One specific behavior to practice' }] as const).map(item => <label key={item.field} className="journal-label">{item.label}<textarea className="journal-field mt-2" rows={4} maxLength={item.field === 'nextFocus' ? 5000 : 10000} placeholder={item.placeholder} value={draft[item.field]} onChange={event => { setDraft(previous => ({ ...previous, [item.field]: event.target.value })); setDirty(true); setSaved(false) }} /></label>)}</div>
    <details><summary className="cursor-pointer text-xs text-muted-foreground">Additional daily notes</summary><textarea aria-label="Daily notes" className="journal-field mt-3" rows={4} maxLength={20000} value={draft.notes} onChange={event => { setDraft(previous => ({ ...previous, notes: event.target.value })); setDirty(true); setSaved(false) }} /></details>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.reviewed} onChange={event => { setDraft(previous => ({ ...previous, reviewed: event.target.checked })); setDirty(true); setSaved(false) }} />Daily review complete</label></fieldset>
    {error && <div role="alert" className="mt-4 text-sm text-loss"><p>{error}</p><button type="button" className="mt-2 underline" onClick={() => { if (!dirty || window.confirm('Replace unsaved reflection with the saved version?')) onSaved() }}>Reload saved reflection</button></div>}<div className="mt-5 flex items-center gap-3"><button type="submit" disabled={busy} className="action-primary disabled:opacity-50">{busy ? 'Saving reflection…' : 'Save reflection'}</button><span role="status" className="text-xs text-muted-foreground">{saved || (!dirty && initial.version > 0) ? 'Reflection saved' : ''}</span></div>
  </form>
}
