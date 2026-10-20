'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PrivateAmount } from '@/components/providers/AmountPrivacy'

type Status = {
  configured: boolean; connected: boolean; needsReconnect: boolean; bound: boolean; accountId?: string | null;
  accounts: { index: number; label: string }[]; localAccounts: { id: string; name: string }[];
  autoSync: boolean; refreshExpiresAt?: string | null; lastSyncAt?: string | null; message?: string | null;
  preview: { hash: string; days: number; rows: number; from?: string; to?: string; transactions: { day: string; action: string; symbol: string; quantity: number; price: number; fees: number }[] } | null;
}

export default function ConnectionsClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [index, setIndex] = useState('0')
  const [accountId, setAccountId] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [autoSync, setAutoSync] = useState(false)
  const [disconnect, setDisconnect] = useState(false)
  async function load() {
    try {
      const response = await fetch('/api/brokers/schwab', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load connections. Please retry.')
      const data: Status = await response.json()
      setStatus(data); setAccountId(current => current || data.accountId || data.localAccounts[0]?.id || '__new__')
      setAutoSync(data.autoSync)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load connections.') }
  }
  useEffect(() => {
    void load()
    if (new URLSearchParams(window.location.search).get('schwab') === 'failed') setError('Schwab authorization failed or was cancelled. Try connecting again after checking app approval and callback settings.')
  }, [])
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/brokers/schwab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? 'Schwab request failed. Try again.')
      if (data.url) { window.location.assign(data.url); return }
      setStatus(data); setAutoSync(data.autoSync); setDisconnect(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Schwab request failed.') }
    finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div><p className="text-xs uppercase tracking-widest text-primary">Broker connections</p><h1 className="mt-2 text-3xl font-semibold">Connect Schwab</h1><p className="mt-2 text-sm text-muted-foreground">Bring completed trading days into your journal without uploading statements.</p></div>
    {error && <div role="alert" className="rounded-lg border border-loss/30 bg-loss/10 p-4 text-sm">{error} {!status && <Button variant="outline" onClick={() => { setError(''); void load() }}>Retry</Button>}</div>}
    {!status && !error && <div aria-label="Loading connections" className="h-56 animate-pulse rounded-xl bg-muted" />}
    {status && <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label="Schwab connection">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Charles Schwab</h2><span className="rounded-full bg-muted px-3 py-1 text-sm">{status.needsReconnect ? 'Reconnect required' : status.connected ? 'Connected' : 'Not connected'}</span></div>
      <p className="text-sm text-muted-foreground">AuraTrade fetches transaction data only. It never places orders. Schwab handles your brokerage login.</p>
      {!status.configured && <p role="status">Schwab server configuration is incomplete. Add the app credentials and encryption key before connecting.</p>}
      {status.message && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{status.message}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !status.configured} onClick={() => void act({ action: 'connect' })}>{status.connected ? 'Reconnect Schwab' : 'Connect Schwab'}</Button>
      {status.connected && <Button variant="outline" disabled={busy} onClick={() => setDisconnect(true)}>Disconnect</Button>}</div>
      {disconnect && <div className="space-y-3 rounded-lg border p-4"><p>Disconnect and delete stored broker access? Imported trades and journals stay in AuraTrade. Revoke the app in Schwab too if you want to remove its authorization there.</p><Button disabled={busy} onClick={() => void act({ action: 'disconnect' })}>Confirm disconnect</Button> <Button variant="outline" disabled={busy} onClick={() => setDisconnect(false)}>Cancel</Button></div>}
      {status.connected && status.accounts.length > 0 && <div className="space-y-4 border-t pt-5">
        <h3 className="font-medium">Match your accounts</h3>
        <label className="block space-y-2 text-sm">Schwab account<select className="block w-full rounded border bg-background p-2" value={index} disabled={busy} onChange={e => setIndex(e.target.value)}>{status.accounts.map(a => <option key={a.index} value={a.index}>{a.label}</option>)}</select></label>
        <label className="block space-y-2 text-sm">AuraTrade account<select className="block w-full rounded border bg-background p-2" value={accountId} disabled={busy} onChange={e => setAccountId(e.target.value)}>{status.localAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="__new__">Create a separate Schwab account (starting balance $0)</option></select></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} />These are the same brokerage account. Existing uploaded statements belong to this Schwab account.</label>
        <Button disabled={busy || !accountId || !acknowledged} onClick={() => void act({ action: 'bind', index: Number(index), accountId, acknowledged })}>Link accounts</Button>
      </div>}
      {status.bound && !status.accounts.length && !status.needsReconnect && <div className="space-y-4 border-t pt-5">
        <p className="text-sm">Linked to {status.localAccounts.find(a => a.id === status.accountId)?.name}. Fetch recent completed days for review. This can take a few minutes.</p>
        <Button variant="outline" disabled={busy} onClick={() => void act({ action: 'preview' })}>Fetch sync preview</Button>
        {status.preview && <div className="space-y-3 rounded-lg border p-4"><h3 className="font-medium">Sync preview</h3><p>{status.preview.rows} equity transactions across {status.preview.days} checked days{status.preview.from ? ` (${status.preview.from} to ${status.preview.to})` : ''}.</p>
          <p className="text-sm text-muted-foreground">The existing ledger reconciles overlapping uploads. Timestamped thinkorswim fills take precedence. Fees come from Schwab; transaction times are treated as date-only. Missing earlier positions or unsupported records block the batch.</p>
          <details><summary className="cursor-pointer text-sm">Inspect transactions and broker fees</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Day', 'Action', 'Symbol', 'Shares', 'Price', 'Fees'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{status.preview.transactions.map((t, i) => <tr className="border-t font-mono" key={i}><td className="p-2">{t.day}</td><td className="p-2">{t.action}</td><td className="p-2">{t.symbol}</td><td className="p-2">{t.quantity}</td><td className="p-2">{t.price}</td><td className="p-2"><PrivateAmount>{t.fees}</PrivateAmount></td></tr>)}</tbody></table></div>{status.preview.rows > 500 && <p className="text-sm">Showing the first 500 transactions of {status.preview.rows}.</p>}</details>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={autoSync} disabled={busy} onChange={e => setAutoSync(e.target.checked)} />Automatically sync completed days each morning after 6 a.m. New York time</label>
          <Button disabled={busy} onClick={() => void act({ action: 'confirm', hash: status.preview!.hash, autoSync })}>Confirm sync</Button>
        </div>}
        {status.autoSync && <Button variant="outline" disabled={busy} onClick={() => void act({ action: 'pause' })}>Pause daily sync</Button>}
      </div>}
      {busy && <p role="status">Working with Schwab… Keep this page open.</p>}
      <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Last successful sync</dt><dd>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Not synced yet'}</dd></div><div><dt className="text-muted-foreground">Authorization renewal</dt><dd>{status.refreshExpiresAt ? new Date(status.refreshExpiresAt).toLocaleString() : 'Connect to authorize'}</dd></div></dl>
    </section>}
    <p className="text-sm text-muted-foreground">First sync checks up to 59 completed days; later syncs recheck at least 7 days for late activity. Older history still needs CSV exports. Options, transfers of securities, corrections and unrecognized fee layouts require review. Schwab generally requires fresh authorization about weekly.</p>
  </div>
}
