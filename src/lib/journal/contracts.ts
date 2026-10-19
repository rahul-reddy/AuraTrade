import { z } from 'zod'

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Choose a valid calendar date.')

const label = z.string().trim().min(1).max(60)
const labels = z.array(label).max(12).transform(values => [...new Set(values)])
export const journalSchema = z.object({
  tradeId: z.string().min(1).max(100).optional(),
  journalId: z.string().min(1).max(100).optional(),
  version: z.number().int().nonnegative(),
  thesis: z.string().max(10000),
  setup: z.string().trim().max(100),
  plannedStop: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/).refine(value => Number(value) > 0).nullable(),
  mistakes: labels,
  lesson: z.string().max(10000),
  notes: z.string().max(20000),
  tags: labels,
  planAdherence: z.enum(['UNASSESSED', 'FOLLOWED', 'PARTIAL', 'BROKE']),
  reviewed: z.boolean(),
}).strict().refine(value => !!value.tradeId !== !!value.journalId, 'Specify a trade or journal.')

export const dailyReviewSchema = z.object({
  accountId: z.string().min(1).max(100),
  date: daySchema,
  version: z.number().int().nonnegative(),
  whatWorked: z.string().max(10000),
  toImprove: z.string().max(10000),
  nextFocus: z.string().max(5000),
  notes: z.string().max(20000),
  reviewed: z.boolean(),
}).strict()

export type JournalInput = z.infer<typeof journalSchema>
export type JournalDraft = Omit<JournalInput, 'tradeId' | 'journalId'>
export type JournalAttachmentInfo = { id: string; contentType: string; byteSize: number }
export type JournalView = JournalDraft & {
  id: string | null; symbol: string; updatedAt: string | null; attachments: JournalAttachmentInfo[]
}
export type DailyReviewDraft = Omit<z.infer<typeof dailyReviewSchema>, 'accountId' | 'date'>

export class JournalError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_ATTACHMENTS = 5
export const MAX_ACCOUNT_IMAGE_BYTES = 100 * 1024 * 1024

export function imageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}
