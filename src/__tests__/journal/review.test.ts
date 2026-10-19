import { daySchema, imageContentType, journalSchema } from '@/lib/journal/contracts'
import { fillDayWhere, reviewSummary, shiftDay } from '@/lib/journal/review'

describe('daily review financial boundaries', () => {
  it('counts only known realized closes on the exchange trading date, with broker fees', () => {
    const result = reviewSummary([
      { isOpen: false, exitTime: '2026-01-16T01:30:00Z', exitTradingDate: '2026-01-15', netPnl: 120, totalFees: 1.25, reviewed: true },
      { isOpen: false, exitTime: '2026-01-15T00:00:00Z', netPnl: -40, totalFees: .75, reviewed: false },
      { isOpen: false, exitTime: '2026-01-15T00:00:00Z', netPnl: 0, totalFees: .5, reviewed: false },
      { isOpen: true, exitTime: null, netPnl: 999, totalFees: 50, reviewed: false },
      { isOpen: false, exitTime: '2026-01-14T00:00:00Z', netPnl: 500, totalFees: 30, reviewed: true },
      { isOpen: false, exitTime: '2026-01-15T00:00:00Z', netPnl: null, totalFees: 9, reviewed: false },
    ], '2026-01-15')
    expect(result).toEqual({ closedCount: 3, netPnl: 80, fees: 2.5, winRate: 1 / 3, reviewedCount: 2, needsReviewCount: 4, unknownPnlCount: 1 })
  })
  it('does not invent a win rate for an empty session', () => {
    expect(reviewSummary([], '2026-01-15')).toMatchObject({ netPnl: 0, fees: 0, winRate: null, closedCount: 0 })
  })
  it('uses civil-day session bounds over DST and includes legacy midnight fills', () => {
    const where = fillDayWhere('2026-03-08')
    expect(where).toEqual({ OR: [
      { time: { gte: new Date('2026-03-08T05:00:00Z'), lt: new Date('2026-03-09T04:00:00Z') } },
      { time: new Date('2026-03-08T00:00:00Z') },
    ] })
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})

it('rejects invalid calendar dates and normalizes duplicate labels without losing text', () => {
  expect(daySchema.safeParse('2026-02-30').success).toBe(false)
  expect(daySchema.safeParse('2026-1-15').success).toBe(false)
  const input = { tradeId: 'synthetic-trade', version: 0, thesis: '<script>literal writing</script>', setup: '', plannedStop: '12.3456', mistakes: ['Chased', 'Chased'], lesson: '', notes: '', tags: [], reviewed: false, planAdherence: 'UNASSESSED' }
  expect(journalSchema.parse(input)).toMatchObject({ thesis: input.thesis, mistakes: ['Chased'] })
  for (const value of ['0', '-1', '12.34567', '1e2', '100000000', 'NaN']) expect(journalSchema.safeParse({ ...input, plannedStop: value }).success).toBe(false)
  expect(journalSchema.safeParse({ ...input, journalId: 'also-an-id' }).success).toBe(false)
})

it('accepts only recognized raster signatures, excluding SVG and HTML', () => {
  expect(imageContentType(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe('image/png')
  expect(imageContentType(new Uint8Array([255,216,255]))).toBe('image/jpeg')
  expect(imageContentType(new TextEncoder().encode('RIFFxxxxWEBP'))).toBe('image/webp')
  expect(imageContentType(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toBeNull()
  expect(imageContentType(new Uint8Array())).toBeNull()
})
