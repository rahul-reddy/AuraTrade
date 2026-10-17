import { Prisma } from '@/generated/prisma'
import { buildDailySnapshots } from '@/lib/engine/daily-snapshots'
import { buildDailyPerformanceSeries, calculatePerformanceMetrics } from '@/lib/engine/metrics'
import { buildDashboardInsights } from '@/lib/dashboard/dashboard-data'
import type { DashboardTradePoint } from '@/lib/dashboard/types'
import {
  exitTradingDayRangeWhere,
  tradingDayKey,
  tradingDayOfWeek,
  tradingDayRangeWhere,
} from '@/lib/trades/trading-date'
import {
  selectAccountLedgerRows,
  tradingDateOf,
} from '@/lib/engine/account-ledger-rebuild'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'
import { mapBrokerPositionToTradeCreateInput } from '@/lib/engine/broker-trade-importer'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'

// A Friday expiration: the ledger orders it at 23:59:59.999 ET, which is the
// next (Saturday) UTC date. All daily aggregates must still count it on Friday.
const FRIDAY = '2026-03-20'
const EXPIRY_INSTANT = '2026-03-21T03:59:59.999Z'
// Month-end: a 3/31 expiration orders at 04-01 03:59Z but is March P&L.
const MONTH_END = '2026-03-31'
const MONTH_END_INSTANT = '2026-04-01T03:59:59.999Z'

describe('tradingDayKey', () => {
  test('prefers the stored trading date over the ordering instant', () => {
    expect(tradingDayKey(new Date(`${FRIDAY}T00:00:00.000Z`), new Date(EXPIRY_INSTANT))).toBe(FRIDAY)
    expect(tradingDayKey(FRIDAY, EXPIRY_INSTANT)).toBe(FRIDAY)
  })

  test('falls back to the UTC date for trades written before trading dates existed', () => {
    expect(tradingDayKey(null, '2026-03-12T00:00:00.000Z')).toBe('2026-03-12')
  })

  test('reports the day of week of the trading day', () => {
    expect(tradingDayOfWeek(FRIDAY)).toBe(5)
  })
})

describe('a date-only expiration through the account ledger', () => {
  test('keeps the Friday trading date while ordering the event after the close', () => {
    const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
    const dryRun = analyzeSchwabStatement(
      [
        header,
        `3/20/2026,Expired,ORCL 03/20/2026 150.00 C,CALL ORACLE CORP $150 EXP 03/20/26,-1,,,`,
        `3/16/2026,Buy to Open,ORCL 03/20/2026 150.00 C,CALL ORACLE CORP $150 EXP 03/20/26,1,"$2.00 ","$0.66 ","($200.66)"`,
      ].join('\n'),
    )
    const selection = selectAccountLedgerRows([
      {
        id: 'th',
        sourceFormat: 'SCHWAB_TRANSACTION_HISTORY',
        coverageFrom: dryRun.coverage?.from ?? null,
        coverageTo: dryRun.coverage?.to ?? null,
        createdAt: new Date('2026-03-21'),
        rows: dryRun.rows,
      },
    ])
    const [position] = buildBrokerPositionLedger(selection.rows).positions
    expect(position.exitTime?.toISOString()).toBe(EXPIRY_INSTANT)
    expect(position).toMatchObject({ entryTradingDate: '2026-03-16', exitTradingDate: FRIDAY })

    const trade = mapBrokerPositionToTradeCreateInput('acct', 'th', null, position)
    expect(trade.exitTradingDate).toEqual(new Date(`${FRIDAY}T00:00:00.000Z`))
  })

  test('a winter after-hours TOS fill belongs to its ET trading day', () => {
    // 2026-01-15T00:30Z is 1/14 19:30 EST.
    const day = tradingDateOf(
      {
        rowIndex: 0, raw: {}, date: new Date('2026-01-15T00:30:00Z'), action: 'Sell', symbol: 'AAA',
        description: '', quantity: 1, price: 1, fees: 0, amount: null, instrumentType: 'EQUITY',
        actionCategory: 'EQUITY_TRADE', optionContract: null, isImportTradeRow: true,
        blocksCanonicalImport: false, notes: [],
      },
      'TOS_ACCOUNT_STATEMENT',
    )
    expect(day).toBe('2026-01-14')
  })
})

describe('daily aggregates bucket by exit trading day', () => {
  const d = (value: number) => new Prisma.Decimal(value)

  test('daily snapshots put a Friday expiration loss on Friday and month-end P&L in March', () => {
    const snapshots = buildDailySnapshots(
      [
        { exitTime: EXPIRY_INSTANT, exitTradingDate: FRIDAY, netPnl: d(-200.66), totalFees: d(0.66) },
        { exitTime: MONTH_END_INSTANT, exitTradingDate: MONTH_END, netPnl: d(-50), totalFees: d(0) },
      ],
      10_000,
    )
    expect(snapshots.map((snapshot) => [snapshot.date.toISOString().slice(0, 10), snapshot.dailyPnl.toNumber()])).toEqual([
      [FRIDAY, -200.66],
      [MONTH_END, -50],
    ])
  })

  test('the daily performance series uses the same trading days', () => {
    const series = buildDailyPerformanceSeries([
      { exitTime: EXPIRY_INSTANT, exitTradingDate: FRIDAY, netPnl: -200.66 },
      { exitTime: MONTH_END_INSTANT, exitTradingDate: MONTH_END, netPnl: -50 },
    ])
    expect(series.map((point) => point.date)).toEqual([FRIDAY, MONTH_END])
  })

  test('day-of-week counts the expiration on Friday, not Saturday', () => {
    const trades: DashboardTradePoint[] = [
      {
        id: 't1', symbol: 'ORCL', exitTime: EXPIRY_INSTANT, exitDate: FRIDAY, netPnl: -200.66,
        totalQty: 1, entryPrice: 2, durationSeconds: 345_600, sector: null, industry: null,
      },
      {
        id: 't2', symbol: 'ORCL', exitTime: MONTH_END_INSTANT, exitDate: MONTH_END, netPnl: -50,
        totalQty: 1, entryPrice: 1, durationSeconds: 86_400, sector: null, industry: null,
      },
    ]
    // The dashboard route derives these from the same trades.
    const metricInputs = trades.map((trade) => ({
      exitTime: trade.exitTime,
      exitTradingDate: trade.exitDate,
      netPnl: trade.netPnl,
    }))
    const summary = calculatePerformanceMetrics(metricInputs, 10_000)
    expect(summary.dailySeries.map((point) => point.date)).toEqual([FRIDAY, MONTH_END])
    const insights = buildDashboardInsights({
      trades,
      dailySeries: summary.dailySeries,
      metrics: summary.metrics,
      startingBalance: 10_000,
    })
    const friday = insights.dayOfWeek.find((point) => point.dayIndex === 5)
    expect(friday).toMatchObject({ tradeCount: 1, pnl: -200.66 })
    expect(insights.dayOfWeek.find((point) => point.dayIndex === 6)?.tradeCount ?? 0).toBe(0)
  })
})

describe('exitTradingDayRangeWhere', () => {
  test('filters on the trading day, falling back to the instant for undated trades', () => {
    expect(exitTradingDayRangeWhere('2026-03-01', '2026-03-31')).toEqual({
      OR: [
        {
          exitTradingDate: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T00:00:00.000Z'),
          },
        },
        {
          exitTradingDate: null,
          exitTime: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T23:59:59.999Z'),
          },
        },
      ],
    })
    expect(exitTradingDayRangeWhere(null, null)).toBeNull()
  })
})

describe('tradingDayRangeWhere for trade entries', () => {
  // Evaluates the { OR: [{ <day field>: range }, { <day field>: null, <instant>: range }] }
  // shape produced by tradingDayRangeWhere against an in-memory trade.
  type Range = { gte?: Date; lte?: Date }
  const inRange = (value: Date | null | undefined, range: Range) =>
    value != null &&
    (range.gte == null || value >= range.gte) &&
    (range.lte == null || value <= range.lte)
  function matches(where: ReturnType<typeof tradingDayRangeWhere>, trade: Record<string, Date | null>) {
    const clauses = (where?.OR ?? []) as Array<Record<string, Range | null>>
    return clauses.some((clause) =>
      Object.entries(clause).every(([field, condition]) =>
        condition === null ? trade[field] == null : inRange(trade[field], condition),
      ),
    )
  }

  // A TOS buy at 1/14/26 19:30 EST is stored at 1/15 00:30Z with entry trading day 1/14.
  const afterHoursEntry = {
    entryTime: new Date('2026-01-15T00:30:00Z'),
    entryTradingDate: new Date('2026-01-14T00:00:00Z'),
  }

  test('an after-hours entry is found under its ET trading day, not the next UTC day', () => {
    expect(matches(tradingDayRangeWhere('entry', '2026-01-14', '2026-01-14'), afterHoursEntry)).toBe(true)
    expect(matches(tradingDayRangeWhere('entry', '2026-01-15', '2026-01-15'), afterHoursEntry)).toBe(false)
  })

  test('trades without a stored trading date still filter by their UTC entry date', () => {
    const legacy = { entryTime: new Date('2026-01-15T00:00:00Z'), entryTradingDate: null }
    expect(matches(tradingDayRangeWhere('entry', '2026-01-15', '2026-01-15'), legacy)).toBe(true)
    expect(matches(tradingDayRangeWhere('entry', '2026-01-14', '2026-01-14'), legacy)).toBe(false)
  })

  test('the ledger stores the ET trading day for that after-hours entry', () => {
    const position = buildBrokerPositionLedger(
      selectAccountLedgerRows([
        {
          id: 'tos',
          sourceFormat: 'TOS_ACCOUNT_STATEMENT',
          coverageFrom: new Date('2026-01-14T00:00:00Z'),
          coverageTo: new Date('2026-01-14T00:00:00Z'),
          createdAt: new Date('2026-01-16'),
          rows: [
            {
              rowIndex: 0, raw: {}, date: afterHoursEntry.entryTime, action: 'Buy', symbol: 'ABC',
              description: '', quantity: 10, price: 10, fees: 0, amount: null, instrumentType: 'EQUITY',
              actionCategory: 'EQUITY_TRADE', optionContract: null, isImportTradeRow: true,
              blocksCanonicalImport: false, notes: [],
            },
          ],
        },
      ]).rows,
    ).positions[0]
    const trade = mapBrokerPositionToTradeCreateInput('acct', 'tos', null, position)
    expect(trade.entryTime).toEqual(afterHoursEntry.entryTime)
    expect(trade.entryTradingDate).toEqual(afterHoursEntry.entryTradingDate)
  })
})
