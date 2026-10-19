'use client'
import { useDraftNavigationGuard } from '@/components/providers/DraftNavigationGuard'

import Image from 'next/image'
import JournalPlaybook from './JournalPlaybook'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, Save, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { JournalView, JournalDraft, JournalAttachmentInfo } from '@/lib/journal/contracts'

type Props = { tradeId?: string; journalId?: string; onDirtyChange?: (dirty: boolean) => void; onSaved?: () => void }
const labels = (value: string) => [...new Set(value.split(',').map(label => label.trim()).filter(Boolean))]

async function fetchJournal(identity: string): Promise<JournalView> {
  const response = await fetch(`/api/journal?${identity}`, { cache: 'no-store' })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || 'Could not load this journal.')
  return payload as JournalView
}

export default function JournalEditor(props: Props) {
  const identity = props.journalId ? `journalId=${encodeURIComponent(props.journalId)}` : `tradeId=${encodeURIComponent(props.tradeId ?? '')}`
  const key = ['journal', identity]
  const query = useQuery({ queryKey: key, queryFn: () => fetchJournal(identity), refetchOnWindowFocus: false })
  const client = useQueryClient()
  if (query.isPending) return <div role="status" aria-label="Loading journal" className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-9" /><Skeleton className="h-20" /></div>
  if (query.isError) return <div role="alert" className="space-y-3 text-sm"><p>{query.error.message}</p><button type="button" className="action-secondary" onClick={() => void query.refetch()}>Retry journal</button></div>
  return <JournalForm key={`${identity}:${query.data.version}`} {...props} initial={query.data} onResult={result => client.setQueryData(key, result)} onReload={() => void query.refetch()} />
}

function JournalForm({ initial, onResult, onReload, tradeId, journalId, onDirtyChange, onSaved }: Props & { initial: JournalView; onResult: (result: JournalView) => void; onReload: () => void }) {
  const [draft, setDraft] = useState<JournalDraft>(() => ({ thesis: initial.thesis, setup: initial.setup, plannedStop: initial.plannedStop, mistakes: initial.mistakes, lesson: initial.lesson, notes: initial.notes, tags: initial.tags, planAdherence: initial.planAdherence, reviewed: initial.reviewed, version: initial.version }))
  const [tagText, setTagText] = useState(initial.tags.join(', '))
  const [mistakeText, setMistakeText] = useState(initial.mistakes.join(', '))
  const [changed, setChanged] = useState(false)
  useDraftNavigationGuard(changed)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { onDirtyChange?.(changed); return () => onDirtyChange?.(false) }, [changed, onDirtyChange])
  useEffect(() => {
    if (!changed) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changed])
  function change<K extends keyof JournalDraft>(field: K, value: JournalDraft[K]) { setDraft(previous => ({ ...previous, [field]: value })); setChanged(true); setMessage('') }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setConflict(false)
    try {
      const response = await fetch('/api/journal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, tags: labels(tagText), mistakes: labels(mistakeText), ...(tradeId ? { tradeId } : { journalId }) }) })
      const payload = await response.json()
      if (!response.ok) { setConflict(response.status === 409); throw new Error(payload.message || 'Could not save your journal. Please retry.') }
      setChanged(false); onDirtyChange?.(false); onResult(payload as JournalView); onSaved?.(); setMessage('Journal saved')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save your journal.') } finally { setSaving(false) }
  }
  async function upload(file: File) {
    if (!initial.id) return
    setImageBusy(true); setError(null)
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Choose a screenshot up to 3 MB.')
      const response = await fetch(`/api/journal/${encodeURIComponent(initial.id)}/attachments`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Could not upload the screenshot.')
      onResult({ ...initial, attachments: [...initial.attachments, payload as JournalAttachmentInfo] })
      setMessage('Screenshot added')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload the screenshot.') } finally { setImageBusy(false) }
  }
  async function remove(id: string) {
    setImageBusy(true); setError(null)
    try {
      const response = await fetch(`/api/journal/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove the screenshot. Please retry.')
      onResult({ ...initial, attachments: initial.attachments.filter(image => image.id !== id) }); setMessage('Screenshot removed')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not remove the screenshot.') } finally { setImageBusy(false) }
  }
  return <form onSubmit={save} aria-label="Trade journal" className="space-y-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">Your trade journal</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Record the decision behind {initial.symbol}.</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{changed ? 'Unsaved changes' : initial.reviewed ? 'Reviewed' : 'Needs review'}</span></div>
    <fieldset disabled={saving} className="space-y-4">
      <label className="journal-label">Trade thesis<textarea className="journal-field mt-1.5" rows={3} maxLength={10000} placeholder="What did you see, and why did you take this trade?" value={draft.thesis} onChange={event => change('thesis', event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="journal-label">Your setup<input className="journal-field mt-1.5" maxLength={100} placeholder="e.g. Opening range" value={draft.setup} onChange={event => change('setup', event.target.value)} /></label><label className="journal-label">Planned stop<input className="journal-field mt-1.5 font-mono" inputMode="decimal" placeholder="Optional price" value={draft.plannedStop ?? ''} onChange={event => change('plannedStop', event.target.value || null)} /></label></div>
      <label className="journal-label">Did you follow your plan?<select className="journal-field mt-1.5" value={draft.planAdherence} onChange={event => change('planAdherence', event.target.value as JournalDraft['planAdherence'])}><option value="UNASSESSED">Not assessed</option><option value="FOLLOWED">Followed my plan</option><option value="PARTIAL">Partly followed my plan</option><option value="BROKE">Broke my plan</option></select></label>
      <label className="journal-label">Mistakes<input className="journal-field mt-1.5" placeholder="Chased entry, moved stop… (comma separated)" maxLength={750} value={mistakeText} onChange={event => { setMistakeText(event.target.value); setChanged(true) }} /></label>
      <label className="journal-label">Lesson for next time<textarea className="journal-field mt-1.5" rows={3} maxLength={10000} placeholder="What would you repeat or change?" value={draft.lesson} onChange={event => change('lesson', event.target.value)} /></label>
      <details><summary className="cursor-pointer text-xs text-muted-foreground">Notes and tags</summary><div className="mt-3 space-y-3"><label className="journal-label">Additional notes<textarea className="journal-field mt-1.5" rows={4} maxLength={20000} value={draft.notes} onChange={event => change('notes', event.target.value)} /></label><label className="journal-label">Tags<input className="journal-field mt-1.5" maxLength={750} placeholder="A+ setup, earnings… (comma separated)" value={tagText} onChange={event => { setTagText(event.target.value); setChanged(true) }} /></label></div></details>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.reviewed} onChange={event => change('reviewed', event.target.checked)} /><Check size={13} className="text-primary" />Review complete</label>
    </fieldset>
    {error && <div role="alert" className="space-y-2 rounded-lg border border-loss/30 bg-loss/5 p-3 text-xs leading-5 text-loss"><p>{error}</p>{conflict && <button type="button" className="underline" onClick={() => { if (!changed || window.confirm('Replace your unsaved changes with the saved version?')) onReload() }}>Reload saved version</button>}</div>}
    <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={saving || imageBusy} className="action-primary inline-flex items-center gap-2 disabled:opacity-50"><Save size={14} />{saving ? 'Saving journal…' : 'Save journal'}</button><span role="status" aria-label="Journal save status" className="text-xs text-muted-foreground">{message || (!changed && initial.updatedAt ? 'Journal saved' : '')}</span></div>
    {initial.id && <JournalPlaybook journalId={initial.id} />}
    <section className="border-t border-border pt-4" aria-label="Journal screenshots"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium">Screenshots</p><span className="text-[10px] text-muted-foreground">{initial.attachments.length}/5 · up to 3 MB each</span></div>
      {initial.attachments.length > 0 && <div className="mb-3 grid grid-cols-2 gap-2">{initial.attachments.map((attachment, index) => <div key={attachment.id} className="relative rounded-md border border-border p-1"><a href={`/api/journal/attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open screenshot ${index + 1}`}><Image unoptimized src={`/api/journal/attachments/${attachment.id}`} alt={`Journal screenshot ${index + 1}`} width={400} height={250} className="h-24 w-full rounded object-contain" /></a><button type="button" disabled={imageBusy || saving} aria-label={`Remove screenshot ${index + 1}`} onClick={() => void remove(attachment.id)} className="absolute right-1 top-1 rounded bg-card p-1 text-loss"><Trash2 size={13} /></button></div>)}</div>}
      <label className={`action-secondary inline-flex gap-2 ${!initial.id || imageBusy || saving || initial.attachments.length >= 5 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}><ImagePlus size={14} />{imageBusy ? 'Updating screenshot…' : 'Add screenshot'}<input className="sr-only" type="file" aria-label="Add journal screenshot" accept="image/png,image/jpeg,image/webp" disabled={!initial.id || imageBusy || saving || initial.attachments.length >= 5} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} /></label>
      {!initial.id && <p className="mt-2 text-[11px] text-muted-foreground">Save the journal to add screenshots.</p>}
    </section>
  </form>
}
