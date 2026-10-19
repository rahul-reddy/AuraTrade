import { z } from 'zod'
const evidenceSchema = z.object({ state: z.enum(['running', 'success', 'failed']), lastAttempt: z.string().datetime({ offset: true }), lastSuccess: z.string().datetime({ offset: true }).optional() })
const statusSchema = z.object({ backup: evidenceSchema.optional(), restore: evidenceSchema.optional() })
export type HealthSignal = { state: 'healthy' | 'attention' | 'unknown'; message: string; lastSuccess: string | null }
export function operationalSignals(raw: unknown, now = Date.now()): { backup: HealthSignal; restore: HealthSignal } {
  const parsed = statusSchema.safeParse(raw)
  function signal(kind: 'backup' | 'restore', maxHours: number): HealthSignal {
    const item = parsed.success ? parsed.data[kind] : undefined
    if (!item) return { state: 'unknown', message: 'No operational evidence is available.', lastSuccess: null }
    const success = item.lastSuccess ? Date.parse(item.lastSuccess) : null
    const age = success == null ? Infinity : now - success
    const attemptAge = now - Date.parse(item.lastAttempt)
    if (item.state === 'failed') return { state: 'attention', message: 'The latest attempt failed. Inspect the server job log.', lastSuccess: item.lastSuccess ?? null }
    if (item.state === 'running') return { state: 'attention', message: attemptAge > 3600000 ? 'The job has not completed within an hour. Inspect the server job log.' : 'A verification job is running.', lastSuccess: item.lastSuccess ?? null }
    if (age < 0 || age > maxHours * 3600000 || attemptAge < 0) return { state: 'attention', message: 'The last successful check is missing, outdated, or has an invalid clock time.', lastSuccess: item.lastSuccess ?? null }
    return { state: 'healthy', message: kind === 'backup' ? 'A recent database dump completed successfully.' : 'A backup was restored and queried in a disposable database.', lastSuccess: item.lastSuccess ?? null }
  }
  return { backup: signal('backup', 36), restore: signal('restore', 240) }
}
export type HealthView = { backup: HealthSignal; restore: HealthSignal; failedImports: number; stuckImports: number; cachedSymbols: number; missingSymbols: string[]; staleSymbols: string[]; checkedAt: string }
