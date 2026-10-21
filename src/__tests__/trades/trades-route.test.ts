import { NextRequest } from 'next/server'
import Papa from 'papaparse'
import { GET } from '@/app/api/trades/route'
import { Prisma, type RoundTripTrade, type TradingAccount } from '@/generated/prisma'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/session', () => ({ getRequiredSession: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  tradingAccount: { findFirst: jest.fn() },
  roundTripTrade: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
} }))

const account: TradingAccount = {
  id: 'owned-account', userId: 'owner', name: 'Synthetic account', broker: 'Schwab/TOS',
  currency: 'USD', startingBalance: new Prisma.Decimal(0), createdAt: new Date('2022-01-01Z'),
}
const request = (exportCsv: boolean) => new NextRequest(`https://app.example/api/trades?accountId=owned-account${exportCsv ? '&export=true' : ''}`)
function trade(notes: string): RoundTripTrade & { classification: { setup: string } } {
  return {
    id: 'synthetic-trade', accountId: account.id, symbol: 'BROS', direction: 'LONG',
    instrumentType: 'EQUITY', underlyingSymbol: null, optionExpiration: null,
    optionStrike: null, optionType: null, contractMultiplier: null, underlyingEquivalentQty: null,
    closeKind: null, brokerStatementImportId: null, brokerStatementPositionId: null,
    entryPrice: new Prisma.Decimal(62), exitPrice: new Prisma.Decimal(61),
    totalQty: new Prisma.Decimal(10), closedQty: new Prisma.Decimal(10), remainingQty: new Prisma.Decimal(0),
    grossPnl: new Prisma.Decimal(-10), totalFees: new Prisma.Decimal('0.04'), netPnl: new Prisma.Decimal('-10.04'),
    initialRisk: null, riskSource: null, rMultiple: new Prisma.Decimal(-1), isOpen: false,
    entryTime: new Date('2022-02-07T15:00:00Z'), exitTime: new Date('2022-02-07T16:00:00Z'), durationSeconds: 3600,
    entryTradingDate: null, exitTradingDate: null, sourceKey: null, tags: [], notes,
    notesUpdatedAt: null, journalId: null, createdAt: new Date('2022-02-07Z'), updatedAt: new Date('2022-02-07Z'),
    classification: { setup: '=SUM(1,2)' },
  }
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com' } })
  jest.mocked(prisma.tradingAccount.findFirst).mockResolvedValue(account)
})

it.each([false, true])('authenticates before any data access (CSV=%s)', async exportCsv => {
  jest.mocked(getRequiredSession).mockRejectedValue(new Response('Unauthorized', { status: 401 }))
  expect((await GET(request(exportCsv))).status).toBe(401)
  expect(prisma.tradingAccount.findFirst).not.toHaveBeenCalled()
  expect(prisma.roundTripTrade.findMany).not.toHaveBeenCalled()
})

it.each([false, true])('rejects an unowned account before reading trades (CSV=%s)', async exportCsv => {
  jest.mocked(prisma.tradingAccount.findFirst).mockResolvedValue(null)
  expect((await GET(request(exportCsv))).status).toBe(404)
  expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith({ where: { id: account.id, userId: 'owner' } })
  expect(prisma.roundTripTrade.findMany).not.toHaveBeenCalled()
  expect(prisma.roundTripTrade.count).not.toHaveBeenCalled()
})

it.each(['=1+1', '+SUM(1,2)', '-2+3', '@SUM(1,2)', '\t=1+1', '\r=1+1'])('exports formula-leading text as a literal: %j', async notes => {
  jest.mocked(prisma.roundTripTrade.findMany).mockResolvedValue([trade(notes)])
  const response = await GET(request(true))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('text/csv')
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;/)
  const rows = Papa.parse<Record<string, string>>(await response.text(), { header: true }).data
  expect(rows).toHaveLength(1)
  expect(rows[0].Notes).toBe("'" + notes)
  expect(rows[0].Setup).toBe("'=SUM(1,2)")
  // Genuine numeric losses must remain usable as numbers in spreadsheets.
  expect(rows[0]['Net P&L']).toBe('-10.04')
  expect(rows[0]['R-Multiple']).toBe('-1')
  expect(prisma.roundTripTrade.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: account.id } }))
})

it('round-trips ordinary notes with quotes, commas and line breaks', async () => {
  const notes = 'Wait for "confirmation", then act.\nKeep the original note.'
  jest.mocked(prisma.roundTripTrade.findMany).mockResolvedValue([trade(notes)])
  const response = await GET(request(true))
  expect(Papa.parse<Record<string, string>>(await response.text(), { header: true }).data[0].Notes).toBe(notes)
})

it.each([false, true])('keeps exception details out of responses and logs (CSV=%s)', async exportCsv => {
  const privateDetail = 'synthetic-private-query-detail'
  jest.mocked(prisma.tradingAccount.findFirst).mockRejectedValue(new Error(privateDetail))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await GET(request(exportCsv))
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain(privateDetail)
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateDetail)
    expect(log).toHaveBeenCalledWith('[GET /api/trades] Could not load trades.')
  } finally { log.mockRestore() }
})
