'use client'
import { useDraftNavigationGuard } from '@/components/providers/DraftNavigationGuard'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import type { PlaybookDraft, PlaybookView } from '@/lib/journal/playbooks'

const empty: PlaybookDraft = { version: 0, name: '', description: '', entryCriteria: '', exitCriteria: '', invalidation: '', archived: false }
export default function PlaybooksClient({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [editing, setEditing] = useState<PlaybookView | 'new' | null>(null)
  const query = useQuery({ queryKey: ['playbooks', accountId], queryFn: async () => {
    const response = await fetch(`/api/playbooks?${new URLSearchParams({ accountId })}`)
    if (!response.ok) throw new Error('Could not load your playbooks.')
    return await response.json() as { playbooks: PlaybookView[] }
  } })
  return <div className="workspace-page space-y-6"><header className="flex flex-wrap justify-between gap-4"><div><p className="eyebrow">{accountName} · Your trading rules</p><h1 className="mt-2 text-3xl font-semibold">Playbooks</h1><p className="mt-2 text-sm text-muted-foreground">Define what qualifies, what invalidates the idea, and when to get out. Attach example trades from a saved journal.</p></div><button className="action-primary self-start" disabled={editing !== null} onClick={() => setEditing('new')}>New playbook</button></header>
    {editing && <PlaybookForm key={typeof editing === 'string' ? 'new' : `${editing.id}:${editing.version}`} accountId={accountId} initial={editing === 'new' ? empty : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void query.refetch() }} />}
    {query.isPending ? <Skeleton className="h-72" /> : query.isError ? <div role="alert" className="surface p-6">{query.error.message}<button className="action-secondary ml-3" onClick={() => void query.refetch()}>Retry playbooks</button></div> : !query.data.playbooks.length ? <div className="surface p-8"><h2 className="font-medium">Write your first repeatable setup</h2><p className="mt-2 text-sm text-muted-foreground">Start with one setup you actually trade. You can refine its rules as you review examples.</p></div> : <div className="grid gap-5 xl:grid-cols-2">{query.data.playbooks.map(book => <article key={book.id} className="surface space-y-4 p-6"><header className="flex justify-between gap-4"><div><h2 className="text-lg font-medium">{book.name}</h2>{book.archived && <p className="text-xs text-muted-foreground">Archived · existing links retained</p>}</div><button className="action-secondary" disabled={editing !== null} onClick={() => setEditing(book)}>Edit rules</button></header><p className="whitespace-pre-wrap text-sm text-muted-foreground">{book.description}</p><dl className="space-y-4 text-sm">{[['Entry criteria', book.entryCriteria], ['Exit criteria', book.exitCriteria], ['Invalidation', book.invalidation]].map(([label, value]) => <div key={label}><dt className="text-xs text-primary">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{value || 'Not defined yet'}</dd></div>)}</dl><div className="border-t border-border pt-4"><h3 className="mb-2 text-xs font-medium">Example trades · {book.examples.length}</h3>{book.examples.length ? book.examples.map(example => <Link key={example.journalId} href={example.tradeId ? `/chart/${encodeURIComponent(example.symbol)}?${new URLSearchParams({ accountId, tradeId: example.tradeId, journal: '1' })}` : `/review?${new URLSearchParams({ accountId })}`} className="mb-2 block rounded border border-border p-3 text-xs hover:bg-muted"><span className="font-mono text-primary">{example.symbol}</span><p className="mt-1 line-clamp-3 text-muted-foreground">{example.thesis || 'Open journal'}{!example.tradeId && ' · journal retained after rebuild; find it by its original review day'}</p></Link>) : <p className="text-xs text-muted-foreground">Choose this playbook in a saved trade journal and mark it as an example.</p>}</div></article>)}</div>}
  </div>
}
function PlaybookForm({ accountId, initial, onClose, onSaved }: { accountId: string; initial: PlaybookDraft; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  useDraftNavigationGuard(dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/playbooks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, accountId, examples: undefined }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Could not save this playbook.')
      setDirty(false); onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this playbook.') } finally { setBusy(false) }
  }
  return <form aria-label="Playbook rules" onSubmit={save} className="surface space-y-4 p-6"><fieldset disabled={busy} className="space-y-4">{([{ field: 'name', label: 'Playbook name', max: 100 }, { field: 'description', label: 'Description', max: 5000 }, { field: 'entryCriteria', label: 'Entry criteria', max: 10000 }, { field: 'exitCriteria', label: 'Exit criteria', max: 10000 }, { field: 'invalidation', label: 'Invalidation', max: 10000 }] as const).map(item => <label key={item.field} className="journal-label">{item.label}{item.field === 'name' ? <input required className="journal-field mt-1" maxLength={item.max} value={draft[item.field]} onChange={event => { setDraft(previous => ({ ...previous, [item.field]: event.target.value })); setDirty(true) }} /> : <textarea className="journal-field mt-1" rows={3} maxLength={item.max} value={draft[item.field]} onChange={event => { setDraft(previous => ({ ...previous, [item.field]: event.target.value })); setDirty(true) }} />}</label>)}<label className="flex gap-2 text-xs"><input type="checkbox" checked={draft.archived} onChange={event => { setDraft(previous => ({ ...previous, archived: event.target.checked })); setDirty(true) }} />Archive this playbook</label></fieldset>{error && <p role="alert" className="text-sm text-loss">{error}</p>}<div className="flex gap-3"><button disabled={busy} className="action-primary">{busy ? 'Saving rules…' : 'Save playbook'}</button><button type="button" className="action-secondary" onClick={() => { if (!dirty || window.confirm('Discard unsaved playbook changes?')) onClose() }}>Cancel</button></div></form>
}
