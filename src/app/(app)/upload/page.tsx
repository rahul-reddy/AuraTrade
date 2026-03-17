'use client'

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
  totalExecutions: number
  skippedRows: number
  newTrades: number
  openPositions: number
  dateRange: { from: string; to: string } | null
  symbols: string[]
  estimatedPnl: number
  warnings: string[]
  assumptions: string[]
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
  | { kind: 'preview'; uploadId: string; accountId: string; summary: UploadSummary; file: File }
  | { kind: 'confirming'; uploadId: string; accountId: string; file: File; summary: UploadSummary }
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
      {...getRootProps()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
        cursor-pointer transition-all duration-150 p-12 w-full max-w-xl
        ${active
          ? 'border-blue-500 bg-blue-500/5'
          : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
        }
      `}
    >
      <input {...getInputProps()} />
      <div className={`p-4 rounded-full ${active ? 'bg-blue-500/10' : 'bg-zinc-800'}`}>
        <Upload className={`w-8 h-8 ${active ? 'text-blue-400' : 'text-zinc-500'}`} />
      </div>
      <div className="text-center">
        <p className="text-zinc-200 font-medium">
          {isDragActive ? 'Drop your CSV here' : 'Drop your Schwab CSV here'}
        </p>
        <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
        <p className="text-zinc-600 text-xs mt-3">
          Schwab / TDA Transaction History export (.csv)
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
  const pnlPositive = summary.estimatedPnl >= 0
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
        <StatRow label="Executions parsed" value={<span className="font-mono">{summary.totalExecutions.toLocaleString()}</span>} />
        <StatRow label="Rows skipped" value={<span className="font-mono text-zinc-500">{summary.skippedRows.toLocaleString()}</span>} />
        <StatRow
          label="Round-trip trades"
          value={<span className="font-mono">{summary.newTrades.toLocaleString()}</span>}
        />
        {summary.openPositions > 0 && (
          <StatRow
            label="Open positions"
            value={
              <Badge variant="outline" className="border-yellow-600 text-yellow-400 font-mono text-xs">
                {summary.openPositions}
              </Badge>
            }
          />
        )}
        <StatRow
          label="Est. net P&L"
          value={
            <span className={`font-mono font-semibold flex items-center gap-1 ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
              {pnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {pnlPositive ? '+' : ''}${summary.estimatedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          }
        />

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

        {/* Warnings */}
        {summary.warnings.length > 0 && (
          <>
            <Separator className="bg-zinc-800 my-3" />
            <div className="py-2 space-y-2">
              <div className="flex items-center gap-2 text-yellow-400">
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
            disabled={isConfirming}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
          >
            {isConfirming ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing…
              </span>
            ) : (
              `Import ${summary.newTrades + summary.openPositions} Trades`
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
      <div className="flex items-center gap-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm">
        <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-blue-300">
          Context enriched — {enrichment.tradesEnriched} trades updated with technical indicators.
          {enrichment.errorCount > 0 && (
            <span className="text-yellow-400 ml-1">({enrichment.errorCount} symbols skipped)</span>
          )}
        </span>
      </div>
    )
  }

  if (enrichment.status === 'error') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="text-yellow-300">
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
        <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin shrink-0" />
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
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
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
          <div className="p-3 rounded-full bg-green-500/10">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Import complete</h2>
            <p className="text-zinc-400 text-sm mt-1">Your trades are ready to analyze.</p>
          </div>
          <div className="w-full bg-zinc-800 rounded-lg p-4 space-y-0 text-left mt-2">
            <StatRow label="New executions added" value={<span className="font-mono">{newExecCount}</span>} />
            <StatRow label="Round-trip trades" value={<span className="font-mono">{totalTrades}</span>} />
            {openPositions > 0 && (
              <StatRow label="Open positions" value={<span className="font-mono text-yellow-400">{openPositions}</span>} />
            )}
            <StatRow
              label="Est. net P&L"
              value={
                <span className={`font-mono font-semibold ${estimatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
    if (phase.kind !== 'preview') return
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
    <div className="text-white">
      {/* Main content */}
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-full max-w-xl mb-8 text-center">
          <h1 className="text-2xl font-semibold text-zinc-100">Import Trades</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Upload your Schwab / TDA Transaction History CSV export.
          </p>
        </div>

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
          <Card className="bg-zinc-900 border-red-900 w-full max-w-xl">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-3 rounded-full bg-red-500/10">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
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
    </div>
  )
}
