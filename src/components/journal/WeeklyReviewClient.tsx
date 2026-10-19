'use client'
import { useDraftNavigationGuard } from '@/components/providers/DraftNavigationGuard'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { mondayOf, type WeeklyDraft } from '@/lib/journal/playbooks'
import { shiftDay } from '@/lib/journal/review'

type Data = { weekStart: string; review: WeeklyDraft; journals: Array<{ id: string; symbol: string; planAdherence: string; mistakes: string[]; lesson: string; trade: { id: string } | null }>; daily: Array<{ date: string; nextFocus: string; reviewed: boolean }> }
export default function WeeklyReviewClient({ accountId, initialDay }: { accountId: string; initialDay: string }) {
  const [week, setWeek] = useState(mondayOf(initialDay))
  const [dirty, setDirty] = useState(false)
  const query = useQuery({ queryKey: ['weekly-review', accountId, week], queryFn: async () => {
    const response = await fetch(`/api/weekly-review?${new URLSearchParams({ accountId, date: week })}`)
    if (!response.ok) throw new Error('Could not load this weekly review.')
    return await response.json() as Data
  }, refetchOnWindowFocus: false })
  function changeWeek(value: string) { if (!dirty || window.confirm('Discard unsaved weekly review?')) { setDirty(false); setWeek(mondayOf(value)) } }
  return <div className="workspace-page space-y-6"><header><p className="eyebrow">Reflect · Choose · Measure</p><h1 className="mt-2 text-3xl font-semibold">Weekly review</h1><p className="mt-2 text-sm text-muted-foreground">Turn the week’s observations into one specific experiment for next week.</p></header><div className="flex flex-wrap items-end gap-3"><button aria-label="Previous review week" className="action-secondary" onClick={() => changeWeek(shiftDay(week, -7))}>← Previous</button><label className="journal-label">Week containing<input type="date" className="journal-field mt-1" value={week} onChange={event => { if (event.target.value) changeWeek(event.target.value) }} /></label><button aria-label="Next review week" className="action-secondary" onClick={() => changeWeek(shiftDay(week, 7))}>Next →</button><span className="pb-2 text-xs text-muted-foreground">Monday {week} through Sunday {shiftDay(week, 6)}</span></div>
    {query.isPending ? <Skeleton className="h-96" /> : query.isError ? <div role="alert" className="surface p-6">{query.error.message}<button className="action-secondary ml-3" onClick={() => void query.refetch()}>Retry weekly review</button></div> : <>
    <div className="grid gap-5 lg:grid-cols-2"><section className="surface space-y-3 p-5"><h2 className="text-sm font-medium">Your journal evidence · {query.data.journals.length}</h2><p className="text-xs leading-5 text-muted-foreground">Journals whose original entry session falls in this week. Process observations are separate from profit and loss.</p>{!query.data.journals.length && <p className="text-sm text-muted-foreground">No trade journals for this week yet.</p>}{query.data.journals.map(journal => <div key={journal.id} className="rounded border border-border p-3 text-xs"><p className="font-medium">{journal.trade ? <Link className="text-primary" href={`/chart/${encodeURIComponent(journal.symbol)}?${new URLSearchParams({ accountId, tradeId: journal.trade.id, journal: '1' })}`}>{journal.symbol}</Link> : journal.symbol} · {journal.planAdherence.replaceAll('_', ' ').toLowerCase()}</p>{journal.mistakes.length > 0 && <p className="mt-2 text-warning">{journal.mistakes.join(' · ')}</p>}<p className="mt-2 whitespace-pre-wrap text-muted-foreground">{journal.lesson || 'No lesson recorded'}</p></div>)}</section><section className="surface p-5"><h2 className="mb-4 text-sm font-medium">Daily reflections</h2>{!query.data.daily.length && <p className="text-sm text-muted-foreground">No daily reflections recorded.</p>}{query.data.daily.map(day => <Link key={day.date} href={`/review?${new URLSearchParams({ accountId, date: day.date })}`} className="mb-3 block rounded border border-border p-3 text-xs hover:bg-muted"><p className="text-primary">{day.date} · {day.reviewed ? 'Reviewed' : 'In progress'}</p><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{day.nextFocus || 'No focus recorded'}</p></Link>)}</section></div>
    <WeeklyForm key={`${week}:${query.data.review.version}`} initial={query.data.review} accountId={accountId} weekStart={week} onDirty={setDirty} onSaved={() => void query.refetch()} />
    </>}
  </div>
}
function WeeklyForm({ initial, accountId, weekStart, onDirty, onSaved }: { initial: WeeklyDraft; accountId: string; weekStart: string; onDirty: (value: boolean) => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  useDraftNavigationGuard(dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { onDirty(dirty); if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', warn); return () => { window.removeEventListener('beforeunload', warn); onDirty(false) } }, [dirty, onDirty])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/weekly-review', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, accountId, weekStart }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Could not save this weekly review.')
      setDraft(previous => ({ ...previous, version: payload.version })); setDirty(false); onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this weekly review.') } finally { setBusy(false) }
  }
  return <form aria-label="Weekly experiment" onSubmit={save} className="surface space-y-4 p-6"><h2 className="font-medium">One experiment for next week</h2><fieldset disabled={busy} className="grid gap-4 lg:grid-cols-2">{([{ field: 'observation', label: 'What pattern did you observe?', placeholder: 'Use specific examples from the journals above.', max: 10000 }, { field: 'experiment', label: 'One change to test', placeholder: 'For example: wait for a retest before entering.', max: 5000 }, { field: 'successCriteria', label: 'How will you measure it?', placeholder: 'Choose a behavior you can observe, rather than a profit target.', max: 5000 }, { field: 'result', label: 'What happened? (follow up)', placeholder: 'Return next week to record the result and what to keep.', max: 10000 }] as const).map(item => <label key={item.field} className="journal-label">{item.label}<textarea className="journal-field mt-2" rows={4} maxLength={item.max} placeholder={item.placeholder} value={draft[item.field]} onChange={event => { setDraft(previous => ({ ...previous, [item.field]: event.target.value })); setDirty(true) }} /></label>)}</fieldset>{error && <div role="alert" className="text-sm text-loss"><p>{error}</p><button type="button" className="mt-2 underline" onClick={() => { if (!dirty || window.confirm('Replace unsaved weekly review with the saved version?')) onSaved() }}>Reload saved review</button></div>}<div className="flex items-center gap-3"><button disabled={busy} className="action-primary">{busy ? 'Saving experiment…' : 'Save weekly review'}</button><span role="status" className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : draft.version > 0 ? 'Weekly review saved' : ''}</span></div></form>
}
