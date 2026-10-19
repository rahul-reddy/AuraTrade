import { z } from 'zod'
import { daySchema } from './contracts'
import { shiftDay } from './review'

export const playbookSchema = z.object({
  accountId: z.string().min(1).max(100), id: z.string().min(1).max(100).optional(), version: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100), description: z.string().max(5000), entryCriteria: z.string().max(10000), exitCriteria: z.string().max(10000), invalidation: z.string().max(10000), archived: z.boolean(),
}).strict()
export const playbookLinkSchema = z.object({ journalId: z.string().min(1).max(100), playbookId: z.string().min(1).max(100).nullable(), isExample: z.boolean(), expectedLink: z.object({ playbookId: z.string().min(1).max(100), isExample: z.boolean() }).nullable() }).strict()
export const weeklyReviewSchema = z.object({
  accountId: z.string().min(1).max(100), weekStart: daySchema.refine(value => new Date(`${value}T12:00:00Z`).getUTCDay() === 1, 'Choose a Monday.'), version: z.number().int().nonnegative(),
  observation: z.string().max(10000), experiment: z.string().max(5000), successCriteria: z.string().max(5000), result: z.string().max(10000),
}).strict()
export function mondayOf(day: string) { const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); return shiftDay(day, -((weekday + 6) % 7)) }
export type PlaybookDraft = Omit<z.infer<typeof playbookSchema>, 'accountId'>
export type PlaybookView = PlaybookDraft & { id: string; examples: Array<{ journalId: string; symbol: string; thesis: string; tradeId: string | null }> }
export type WeeklyDraft = Omit<z.infer<typeof weeklyReviewSchema>, 'accountId' | 'weekStart'>
