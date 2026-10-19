'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
type Data = { accountId: string; link: { playbookId: string; isExample: boolean } | null; playbooks: Array<{ id: string; name: string; archived: boolean }> }
export default function JournalPlaybook({ journalId }: { journalId: string }) {
  const client = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: ['journal-playbook', journalId], queryFn: async () => {
    const response = await fetch(`/api/playbooks/link?${new URLSearchParams({ journalId })}`)
    if (!response.ok) throw new Error('Could not load playbooks.')
    return await response.json() as Data
  } })
  async function assign(playbookId: string | null, isExample: boolean) {
    setBusy(true); setError('')
    const previous = query.data
    if (previous) client.setQueryData(['journal-playbook', journalId], { ...previous, link: playbookId ? { playbookId, isExample } : null })
    try {
      const response = await fetch('/api/playbooks/link', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ journalId, playbookId, isExample, expectedLink: previous?.link ?? null }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Could not save playbook assignment.')
      await query.refetch()
    } catch (error) { if (previous) client.setQueryData(['journal-playbook', journalId], previous); setError(error instanceof Error ? error.message : 'Could not save playbook assignment.') } finally { setBusy(false) }
  }
  return <section className="space-y-2 border-t border-border pt-4" aria-label="Journal playbook"><p className="text-xs font-medium">Playbook</p>{query.isPending ? <p role="status" className="animate-pulse text-xs text-muted-foreground">Loading playbooks…</p> : query.isError ? <p role="alert" className="text-xs text-loss">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p> : <><select aria-label="Assign playbook" className="journal-field" disabled={busy} value={query.data.link?.playbookId ?? ''} onChange={event => void assign(event.target.value || null, false)}><option value="">No playbook</option>{query.data.playbooks.map(book => <option key={book.id} value={book.id}>{book.name}{book.archived ? ' (archived)' : ''}</option>)}</select>{query.data.link && <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} checked={query.data.link.isExample} onChange={event => void assign(query.data.link!.playbookId, event.target.checked)} />Use as an example trade</label>}<Link href={`/playbooks?accountId=${encodeURIComponent(query.data.accountId)}`} className="inline-block text-xs text-primary hover:underline">Manage playbook rules →</Link><p className="text-[10px] leading-5 text-muted-foreground">Assignments save immediately. Your setup label and inferred classification remain separate.</p></>}{error && <p role="alert" className="text-xs text-loss">{error} <button type="button" className="underline" onClick={() => { setError(''); void query.refetch() }}>Reload playbooks</button></p>}</section>
}
