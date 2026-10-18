'use client'

import PageHeader from '@/components/layout/PageHeader'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Cpu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

// ─── types ────────────────────────────────────────────────────────────

interface UploadSummary {
  canImport: boolean
  totalRows: number
  totalExecutions: number
  importableTradeRows: number
  blockedTradeRows: number
  nonTradeRows: number
  positionAffectingNonTradeRows: number
  optionRows: number
  skippedRows: number
  newTrades: number | null
  openPositions: number | null
  dateRange: { from: string; to: string } | null
  symbols: string[]
  estimatedPnl: number | null
  warnings: string[]
  assumptions: string[]
  blockers: string[]
  actionBreakdown: Array<{
    action: string
    count: number
    category: string
    importableCount: number
    blockedCount: number
    instrumentTypes: string[]
  }>
}

interface EnrichmentState {
  status: 'idle' | 'starting' | 'running' | 'done' | 'error'
  total: number
  enriched: number
  tradesEnriched: number
  errorCount: number
  message?: string
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'preview'; uploadId: string | null; accountId: string | null; summary: UploadSummary; file: File }
  | { kind: 'confirming'; uploadId: string; accountId: string | null; file: File; summary: UploadSummary }
  | { kind: 'success'; newExecCount: number; totalTrades: number; openPositions: number; estimatedPnl: number; enrichment: EnrichmentState }
  | { kind: 'error'; message: string }

// ─── helper components ────────────────────────────────────────────────

function StatRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-zinc-400 text-sm">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function AnalyzingSkeleton() {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader>
        <Skeleton className="h-5 w-40 bg-zinc-800" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-32 bg-zinc-800" />
            <Skeleton className="h-4 w-20 bg-zinc-800" />
          </div>
        ))}
        <Skeleton className="h-9 w-full bg-zinc-800 mt-4" />
      </CardContent>
    </Card>
  )
}

// ─── dropzone ─────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [hovered, setHovered] = useState(false)

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0])
    },
    [onFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.csv'] },
    maxFiles: 1,
  })

  const active = isDragActive || hovered

  return (
    <div
      {...getRootProps({ role: 'button', 'aria-label': 'Choose broker CSV file' })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
        cursor-pointer transition-all duration-150 min-h-[300px] p-8 sm:p-12 w-full
        ${active
          ? 'border-primary bg-primary/5'
          : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
        }
      `}
    >
      <input {...getInputProps()} />
      <div className={`p-4 rounded-full ${active ? 'bg-primary/10' : 'bg-zinc-800'}`}>
        <Upload className={`w-8 h-8 ${active ? 'text-primary' : 'text-zinc-500'}`} />
      </div>
      <div className="text-center">
        <p className="text-zinc-200 font-medium">
          {isDragActive ? 'Drop your CSV here' : 'Drop your broker CSV here'}
        </p>
        <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
        <p className="text-zinc-600 text-xs mt-3">
          thinkorswim Account Statement or Schwab Transaction History (.csv)
        </p>
      </div>
    </div>
  )
}

// ─── preview card ─────────────────────────────────────────────────────

function PreviewCard({
  file,
  summary,
  onConfirm,
  onCancel,
  isConfirming,
}: {
  file: File
  summary: UploadSummary
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
}) {
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const pnlPositive = (summary.estimatedPnl ?? 0) >= 0
  const dateFrom = summary.dateRange ? new Date(summary.dateRange.from).toLocaleDateString() : '—'
  const dateTo = summary.dateRange ? new Date(summary.dateRange.to).toLocaleDateString() : '—'

  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-800">
            <FileText className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base text-zinc-100 truncate">{file.name}</CardTitle>
            <p className="text-xs text-zinc-500 mt-0.5">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-0">
        <Separator className="bg-zinc-800 mb-3" />

        {/* Core stats */}
        <StatRow label="Date range" value={`${dateFrom} – ${dateTo}`} />
        <StatRow label="Rows in statement" value={<span className="font-mono">{summary.totalRows.toLocaleString()}</span>} />
        <StatRow label="Executions parsed" value={<span className="font-mono">{summary.totalExecutions.toLocaleString()}</span>} />
        <StatRow label="Importable trade rows" value={<span className="font-mono">{summary.importableTradeRows.toLocaleString()}</span>} />
        {summary.blockedTradeRows > 0 && (
          <StatRow
            label="Blocked trade rows"
            value={<span className="font-mono text-warning">{summary.blockedTradeRows.toLocaleString()}</span>}
          />
        )}
        {summary.optionRows > 0 && (
          <StatRow
            label="Option rows"
            value={<span className="font-mono text-primary">{summary.optionRows.toLocaleString()}</span>}
          />
        )}
        {summary.positionAffectingNonTradeRows > 0 && (
          <StatRow
            label="Position-affecting non-trade rows"
            value={<span className="font-mono text-warning">{summary.positionAffectingNonTradeRows.toLocaleString()}</span>}
          />
        )}
        <StatRow label="Rows skipped" value={<span className="font-mono text-zinc-500">{summary.skippedRows.toLocaleString()}</span>} />
        {summary.newTrades != null && (
          <StatRow
            label="Round-trip trades"
            value={<span className="font-mono">{summary.newTrades.toLocaleString()}</span>}
          />
        )}
        {summary.openPositions != null && summary.openPositions > 0 && (
          <StatRow
            label="Open positions"
            value={
              <Badge variant="outline" className="border-warning text-warning font-mono text-xs">
                {summary.openPositions}
              </Badge>
            }
          />
        )}
        {summary.estimatedPnl != null && (
          <StatRow
            label="Est. net P&L"
            value={
              <span className={`font-mono font-semibold flex items-center gap-1 ${pnlPositive ? 'text-profit' : 'text-loss'}`}>
                {pnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {pnlPositive ? '+' : ''}${summary.estimatedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            }
          />
        )}

        <Separator className="bg-zinc-800 my-3" />

        {/* Symbols */}
        <div className="py-2">
          <p className="text-zinc-400 text-sm mb-2">Symbols ({summary.symbols.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.symbols.slice(0, 20).map((s) => (
              <Badge key={s} variant="secondary" className="bg-zinc-800 text-zinc-300 font-mono text-xs">
                {s}
              </Badge>
            ))}
            {summary.symbols.length > 20 && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 text-xs">
                +{summary.symbols.length - 20} more
              </Badge>
            )}
          </div>
        </div>

        {summary.blockers.length > 0 && (
          <>
            <Separator className="bg-zinc-800 my-3" />
            <div className="py-2 space-y-2">
              <div className="flex items-center gap-2 text-loss">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">Import blocked for safety</span>
              </div>
              <ul className="space-y-1">
                {summary.blockers.map((blocker, index) => (
                  <li key={index} className="text-xs text-zinc-400 pl-5 leading-relaxed">{blocker}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Warnings */}
        {summary.warnings.length > 0 && (
          <>
            <Separator className="bg-zinc-800 my-3" />
            <div className="py-2 space-y-2">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">Grouper warnings ({summary.warnings.length})</span>
              </div>
              <ul className="space-y-1">
                {summary.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-zinc-400 pl-5 leading-relaxed">{w}</li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator className="bg-zinc-800 my-3" />
        <button
          onClick={() => setShowActions(!showActions)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs w-full py-1 transition-colors"
        >
          {showActions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Broker action breakdown ({summary.actionBreakdown.length})
        </button>
        {showActions && (
          <div className="mt-3 space-y-2">
            {summary.actionBreakdown.map((action) => (
              <div key={action.action} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">{action.action}</p>
                    <p className="text-xs text-zinc-500">
                      {action.category} · {action.instrumentTypes.join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-zinc-100">{action.count}</p>
                    {action.blockedCount > 0 ? (
                      <p className="text-[11px] text-warning">{action.blockedCount} blocked</p>
                    ) : (
                      <p className="text-[11px] text-profit">{action.importableCount} importable</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Assumptions (collapsible) */}
        <Separator className="bg-zinc-800 my-3" />
        <button
          onClick={() => setShowAssumptions(!showAssumptions)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs w-full py-1 transition-colors"
        >
          {showAssumptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Parser assumptions applied ({summary.assumptions.length})
        </button>
        {showAssumptions && (
          <ul className="mt-2 space-y-1 pl-4">
            {summary.assumptions.map((a, i) => (
              <li key={i} className="text-xs text-zinc-500 leading-relaxed">{a}</li>
            ))}
          </ul>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isConfirming}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isConfirming || !summary.canImport}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isConfirming ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Importing…
              </span>
            ) : !summary.canImport ? (
              'Dry-run only — import disabled'
            ) : (
              `Import ${(summary.newTrades ?? 0) + (summary.openPositions ?? 0)} Trades`
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── success card ─────────────────────────────────────────────────────

function EnrichmentBanner({ enrichment }: { enrichment: EnrichmentState }) {
  if (enrichment.status === 'idle') return null

  if (enrichment.status === 'done') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm">
        <Cpu className="w-4 h-4 text-primary shrink-0" />
        <span className="text-primary">
          Context enriched — {enrichment.tradesEnriched} trades updated with technical indicators.
          {enrichment.errorCount > 0 && (
            <span className="text-warning ml-1">({enrichment.errorCount} symbols skipped)</span>
          )}
        </span>
      </div>
    )
  }

  if (enrichment.status === 'error') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-warning/10 border border-warning/20 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
        <span className="text-warning">
          {enrichment.message ?? 'Context enrichment failed. Trades are still imported.'}
        </span>
      </div>
    )
  }

  const pct = enrichment.total > 0
    ? Math.round((enrichment.enriched / enrichment.total) * 100)
    : 0

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2.5 text-sm text-zinc-400">
        <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
        <span>
          Enriching trade context…{' '}
          {enrichment.total > 0
            ? `${enrichment.enriched} / ${enrichment.total} symbols`
            : 'starting'}
        </span>
      </div>
      {enrichment.total > 0 && (
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function SuccessCard({
  newExecCount,
  totalTrades,
  openPositions,
  estimatedPnl,
  enrichment,
  onReset,
}: {
  newExecCount: number
  totalTrades: number
  openPositions: number
  estimatedPnl: number
  enrichment: EnrichmentState
  onReset: () => void
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800 w-full max-w-xl">
      <CardContent className="pt-8 pb-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-3 rounded-full bg-profit/10">
            <CheckCircle className="w-8 h-8 text-profit" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Import complete</h2>
            <p className="text-zinc-400 text-sm mt-1">Your trades are ready to analyze.</p>
          </div>
          <div className="w-full bg-zinc-800 rounded-lg p-4 space-y-0 text-left mt-2">
            <StatRow label="New executions added" value={<span className="font-mono">{newExecCount}</span>} />
            <StatRow label="Round-trip trades" value={<span className="font-mono">{totalTrades}</span>} />
            {openPositions > 0 && (
              <StatRow label="Open positions" value={<span className="font-mono text-warning">{openPositions}</span>} />
            )}
            <StatRow
              label="Est. net P&L"
              value={
                <span className={`font-mono font-semibold ${estimatedPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {estimatedPnl >= 0 ? '+' : ''}${estimatedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              }
            />
          </div>
          <EnrichmentBanner enrichment={enrichment} />
          <Button
            onClick={onReset}
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 mt-2"
          >
            Upload another file
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── main page ────────────────────────────────────────────────────────

const IDLE_ENRICHMENT: EnrichmentState = {
  status: 'idle',
  total: 0,
  enriched: 0,
  tradesEnriched: 0,
  errorCount: 0,
  message: undefined,
}

export default function UploadPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    setPhase({ kind: 'analyzing' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        const msg =
          data.error === 'duplicate_file'
            ? 'This file has already been imported.'
            : data.message ?? 'Failed to analyze file.'
        setPhase({ kind: 'error', message: msg })
        return
      }

      setPhase({
        kind: 'preview',
        uploadId: data.uploadId,
        accountId: data.accountId,
        summary: data.summary,
        file,
      })
    } catch {
      setPhase({ kind: 'error', message: 'Network error. Is the server running?' })
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (phase.kind !== 'preview' || !phase.summary.canImport || !phase.uploadId) return
    const { uploadId, accountId, file, summary } = phase
    setPhase({ kind: 'confirming', uploadId, accountId, file, summary })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/upload/${uploadId}/confirm`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setPhase({ kind: 'error', message: data.message ?? 'Import failed.' })
        toast.error('Import failed', { description: data.message })
        return
      }

      toast.success('Trades imported successfully')

      const successState: Phase = {
        kind: 'success',
        newExecCount: data.newExecCount,
        totalTrades: data.totalTrades,
        openPositions: data.openPositions,
        estimatedPnl: data.estimatedPnl,
        enrichment: { status: 'starting', total: 0, enriched: 0, tradesEnriched: 0, errorCount: 0, message: undefined },
      }
      setPhase(successState)

      // Trigger enrichment then poll for progress
      try {
        const triggerRes = await fetch('/api/enrich', { method: 'POST' })
        if (!triggerRes.ok) {
          setPhase((prev) =>
            prev.kind === 'success'
              ? {
                  ...prev,
                  enrichment: {
                    ...prev.enrichment,
                    status: 'error',
                    message: 'Context enrichment could not be started. Trades are still imported.',
                  },
                }
              : prev,
          )
          return
        }

        // Poll every 2 seconds until done
        const poll = async () => {
          try {
            const statusRes = await fetch('/api/enrich')
            if (!statusRes.ok) {
              setPhase((prev) =>
                prev.kind === 'success'
                  ? {
                      ...prev,
                      enrichment: {
                        ...prev.enrichment,
                        status: 'error',
                        message: `Enrichment status check failed (${statusRes.status}). Trades are still imported.`,
                      },
                    }
                  : prev,
              )
              return
            }
            const statusData = (await statusRes.json()) as {
              status: string
              total: number
              enriched: number
              tradesEnriched: number
              done: boolean
              errorCount: number
            }
            setPhase((prev) => {
              if (prev.kind !== 'success') return prev
              const nextEnrichment: EnrichmentState = {
                status: statusData.done ? 'done' : 'running',
                total: statusData.total ?? 0,
                enriched: statusData.enriched ?? 0,
                tradesEnriched: statusData.tradesEnriched ?? 0,
                errorCount: statusData.errorCount ?? 0,
                message: undefined,
              }
              return { ...prev, enrichment: nextEnrichment }
            })
            if (!statusData.done) {
              setTimeout(() => void poll(), 2000)
            }
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : 'Unknown network error'
            setPhase((prev) =>
              prev.kind === 'success'
                ? {
                    ...prev,
                    enrichment: {
                      ...prev.enrichment,
                      status: 'error',
                      message: `Enrichment polling failed: ${message}. Trades are still imported.`,
                    },
                  }
                : prev,
            )
          }
        }

        setTimeout(() => void poll(), 1500)
      } catch {
        // enrichment trigger failure is non-fatal — trades are already imported
      }
    } catch {
      setPhase({ kind: 'error', message: 'Network error during import.' })
    }
  }, [phase])

  const reset = useCallback(() => setPhase({ kind: 'idle' }), [])

  return (
    <div className="text-foreground">
      <div className="workspace-page">
        <PageHeader eyebrow="Workspace / Import center" title="Import Trades" description="Bring your trading history into focus. Review every statement before it becomes part of your account." />
        <ol aria-label="Import progress" className="mb-8 flex flex-wrap gap-6 border-b border-zinc-800 pb-5 text-xs sm:gap-10">
          {['Choose statement', 'Review preview', 'Explore trades'].map((label, index) => {
            const step = phase.kind === 'success' ? 2 : phase.kind === 'preview' || phase.kind === 'confirming' ? 1 : 0
            return <li key={label} aria-current={step === index ? 'step' : undefined} className={`flex items-center gap-2.5 ${step === index ? 'text-primary' : 'text-zinc-500'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] ${step === index ? 'border-primary/50 bg-primary/10' : 'border-zinc-700'}`}>{index + 1}</span>{label}</li>
          })}
        </ol>
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col items-center [&>div]:max-w-none">
        {/* State machine rendering */}
        {phase.kind === 'idle' && <DropZone onFile={handleFile} />}

        {phase.kind === 'analyzing' && <AnalyzingSkeleton />}

        {phase.kind === 'preview' && (
          <PreviewCard
            file={phase.file}
            summary={phase.summary}
            onConfirm={handleConfirm}
            onCancel={reset}
            isConfirming={false}
          />
        )}

        {phase.kind === 'confirming' && (
          <PreviewCard
            file={phase.file}
            summary={phase.summary}
            onConfirm={() => {}}
            onCancel={() => {}}
            isConfirming={true}
          />
        )}

        {phase.kind === 'success' && (
          <SuccessCard
            newExecCount={phase.newExecCount}
            totalTrades={phase.totalTrades}
            openPositions={phase.openPositions}
            estimatedPnl={phase.estimatedPnl}
            enrichment={phase.enrichment}
            onReset={reset}
          />
        )}

        {phase.kind === 'error' && (
          <Card className="bg-zinc-900 border-loss w-full max-w-xl">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-3 rounded-full bg-loss/10">
                  <AlertTriangle className="w-7 h-7 text-loss" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">Something went wrong</h2>
                  <p className="text-zinc-400 text-sm mt-1">{phase.message}</p>
                </div>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
        <aside className="surface p-6">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium"><FileText size={16} className="text-primary" />Prepare your statement</div>
          <p className="eyebrow mb-2">Recommended / thinkorswim</p>
          <p className="text-sm leading-7 text-zinc-300">Open <strong className="font-medium text-foreground">Monitor → Account Statement</strong>. Set your date range, then export the statement as a CSV.</p>
          <p className="mt-3 text-xs leading-6 text-zinc-400">Includes execution times for more precise trade history. Keep the Account Trade History and Cash Balance sections for fills and fees.</p>
          <div className="my-5 border-t border-zinc-800" />
          <p className="eyebrow mb-2">Also supported / Schwab</p>
          <p className="text-xs leading-6 text-zinc-400">Export your Transaction History as CSV. This format includes dates without execution times.</p>
          <div className="mt-6 rounded-lg border border-primary/15 bg-primary/5 p-4 text-xs leading-6 text-zinc-300"><CheckCircle size={15} className="mb-2 text-primary" />You’ll see a preview of trades, fees, and any warnings before you confirm.</div>
        </aside>
        </div>
      </div>
    </div>
  )
}
