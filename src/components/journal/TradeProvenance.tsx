'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPrice } from '@/lib/format'
import type { ProvenanceView } from '@/lib/journal/provenance'
import { PrivateAmount } from '@/components/providers/AmountPrivacy'

export default function TradeProvenance({ tradeId }: { tradeId: string }) {
  const [open, setOpen] = useState(false)
  const query = useQuery({ enabled: open, queryKey: ['trade-provenance', tradeId], queryFn: async () => {
    const response = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/provenance`)
    if (!response.ok) throw new Error('Could not inspect this trade’s source data. Reload if trades were reprocessed.')
    return await response.json() as ProvenanceView
  } })
  return <details className="mt-5 border-t border-border pt-4" onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-xs text-primary">Source data &amp; confidence</summary><div className="mt-4 space-y-4 text-xs leading-5">{query.isPending ? <Skeleton className="h-40" /> : query.isError ? <div role="alert"><p>{query.error.message}</p><button className="action-secondary mt-2" onClick={() => void query.refetch()}>Retry source data</button></div> : <><p className="text-muted-foreground">{query.data.message}</p><dl className="space-y-2"><div><dt className="text-muted-foreground">Your setup</dt><dd>{query.data.personalSetup || 'Not labeled'}</dd></div><div><dt className="text-muted-foreground">Inferred setup · classifier score</dt><dd>{query.data.inferredSetup || 'Not classified'}{query.data.confidence != null ? ` · ${query.data.confidence}/100 (not a probability)` : ''}</dd></div><div><dt className="text-muted-foreground">Risk input</dt><dd>{query.data.riskSource === 'USER' ? 'User supplied' : query.data.riskSource ? `${query.data.riskSource} · estimate; not a recorded stop` : 'Not available'}</dd></div></dl>{query.data.available && query.data.rows.map((row, index) => <article key={`${row.statementId}:${row.rowIndex}:${index}`} className="space-y-2 rounded border border-border p-3"><p className="font-medium">{row.kind} · {row.action}</p><p className="break-all text-muted-foreground">{row.fileName} · broker row index {row.rowIndex}</p><p className="text-muted-foreground">{row.precision}</p><dl className="grid grid-cols-2 gap-2"><div><dt className="text-muted-foreground">Raw date</dt><dd>{row.rawDate || 'Unavailable'}</dd></div><div><dt className="text-muted-foreground">Raw quantity</dt><dd>{row.quantityRaw ?? 'Unavailable'}</dd></div><div><dt className="text-muted-foreground">Raw price</dt><dd>{row.priceRaw ?? 'Unavailable'}</dd></div><div><dt className="text-muted-foreground">Raw fees</dt><dd><PrivateAmount>{row.feesRaw ?? 'Unavailable'}</PrivateAmount></dd></div></dl><p className="font-mono">Applied: {row.qty} @ {row.price == null ? 'no market price' : formatPrice(row.price)} · fees <PrivateAmount>{row.fees.toFixed(4)}</PrivateAmount></p><p className="text-muted-foreground">{row.feeSource}</p>{row.notes.map((note, noteIndex) => <p key={noteIndex} className="text-warning">{note}</p>)}</article>)}</>}</div></details>
}
