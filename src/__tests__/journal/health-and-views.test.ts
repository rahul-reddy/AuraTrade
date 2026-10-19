import { operationalSignals } from '@/lib/journal/health'
import { parseSavedViews, savedViewHref } from '@/lib/journal/saved-views'
import { mondayOf, weeklyReviewSchema, playbookSchema } from '@/lib/journal/playbooks'

it('never treats missing, corrupt, failed, stale, or future-dated evidence as healthy', () => {
  const now = Date.parse('2026-10-18T12:00:00Z')
  expect(operationalSignals(null, now).backup.state).toBe('unknown')
  expect(operationalSignals({ backup: { state: 'success' } }, now).backup.state).toBe('unknown')
  const item = { state: 'success', lastAttempt: '2026-10-18T11:00:00Z', lastSuccess: '2026-10-18T11:00:00Z' }
  expect(operationalSignals({ backup: item, restore: item }, now).backup.state).toBe('healthy')
  expect(operationalSignals({ backup: { ...item, state: 'failed' } }, now).backup.state).toBe('attention')
  expect(operationalSignals({ backup: item }, now + 37 * 3600000).backup.state).toBe('attention')
  expect(operationalSignals({ restore: item }, now + 241 * 3600000).restore.state).toBe('attention')
  expect(operationalSignals({ backup: item }, now - 2 * 3600000).backup.state).toBe('attention')
  expect(operationalSignals({ backup: { ...item, state: 'running' } }, now).backup.state).toBe('attention')
})
it('pins saved views to the current account and a fixed local route', () => {
  const href = savedViewHref('owned', 'accountId=foreign&symbol=SYN&redirect=https://evil.example&page=9&export=true&sortDir=asc')
  expect(href).toBe('/trades?symbol=SYN&sortDir=asc&accountId=owned')
  expect(parseSavedViews('bad json')).toEqual([])
  expect(parseSavedViews('[{"name":"View","query":"status=closed&accountId=foreign"}]')).toEqual([{ name: 'View', query: 'status=closed' }])
  expect(parseSavedViews('[{"name":"","query":""},null]')).toEqual([])
})
it('normalizes review weeks to Monday, including Sunday and year boundaries', () => {
  expect(mondayOf('2026-10-18')).toBe('2026-10-12')
  expect(mondayOf('2026-10-19')).toBe('2026-10-19')
  expect(mondayOf('2026-01-01')).toBe('2025-12-29')
  expect(weeklyReviewSchema.safeParse({ accountId: 'a', weekStart: '2026-10-18', version: 0, observation: '', experiment: '', successCriteria: '', result: '' }).success).toBe(false)
  expect(playbookSchema.safeParse({ accountId: 'a', version: 0, name: ' ', description: '', entryCriteria: '', exitCriteria: '', invalidation: '', archived: false }).success).toBe(false)
})
