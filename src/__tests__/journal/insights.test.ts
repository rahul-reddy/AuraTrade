import { groupInsights, type InsightTrade } from '@/lib/journal/insights'

const trade: InsightTrade = { id: 'one', symbol: 'SYN', direction: 'LONG', entryTime: '2026-01-01T00:00:00Z', exitTime: '2026-01-03T00:30:00Z', exitTradingDate: '2026-01-02', isOpen: false, netPnl: 100, totalFees: 2, inferredSetup: 'MOMENTUM', personalSetup: 'My retest', regime: null, adherence: 'FOLLOWED', reviewed: true, mistakes: [] }

it('uses exit trading dates, known closed P&L, broker fees and breakevens in the denominator', () => {
  const groups = groupInsights([trade, { ...trade, id: 'two', netPnl: 0 }, { ...trade, id: 'open', isOpen: true, netPnl: 500 }, { ...trade, id: 'unknown', netPnl: null }], 'personalSetup', '2026-01-02', '2026-01-02')
  expect(groups).toHaveLength(1)
  expect(groups[0]).toMatchObject({ label: 'My retest', count: 2, netPnl: 100, fees: 4, average: 50, winRate: 0.5 })
  expect(groups[0].interval.lower).toBeLessThan(0.5)
  expect(groups[0].interval.upper).toBeGreaterThan(0.5)
  expect(groupInsights([trade], 'personalSetup', '2026-01-03')).toEqual([])
})

it('keeps personal labels distinct from inferred setups and shows missing classifications honestly', () => {
  expect(groupInsights([trade], 'personalSetup')[0].label).toBe('My retest')
  expect(groupInsights([trade], 'inferredSetup')[0].label).toBe('MOMENTUM')
  expect(groupInsights([trade], 'regime')[0].label).toBe('Unlabeled')
  expect(groupInsights([], 'adherence')).toEqual([])
})

it('groups playbooks by stable id even when two playbooks share a name', () => {
  const groups = groupInsights([{ ...trade, playbookId: 'one', playbook: 'Retest' }, { ...trade, id: 'two', playbookId: 'two', playbook: 'Retest' }], 'playbook')
  expect(groups).toHaveLength(2)
  expect(groups.map(group => group.key)).toEqual(['one', 'two'])
})
