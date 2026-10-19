import { NextRequest } from 'next/server'
import { GET as getBooks, PUT as putBook } from '@/app/api/playbooks/route'
import { GET as getLink, PUT as putLink } from '@/app/api/playbooks/link/route'
import { GET as getWeek, PUT as putWeek } from '@/app/api/weekly-review/route'
import { GET as getHealth } from '@/app/api/health-status/route'
import { GET as getSource } from '@/app/api/trades/[id]/provenance/route'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
jest.mock('@/lib/session', () => ({ getRequiredSession: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { tradingAccount: { findFirst: jest.fn() }, tradeJournal: { findFirst: jest.fn() }, $transaction: jest.fn() } }))
const request = (method = 'GET', body?: unknown) => new NextRequest('https://app.example/api/playbooks?accountId=foreign', { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) })
beforeEach(() => jest.resetAllMocks())

it('authenticates all new handlers before inspecting owned records', async () => {
  jest.mocked(getRequiredSession).mockRejectedValue(new Response('Unauthorized', { status: 401 }))
  const responses = await Promise.all([getBooks(request()), putBook(request('PUT')), getLink(request()), putLink(request('PUT')), getWeek(request()), putWeek(request('PUT')), getHealth(request()), getSource(request(), { params: Promise.resolve({ id: 'foreign' }) })])
  expect(responses.map(response => response.status)).toEqual(Array(8).fill(401))
  expect(prisma.tradingAccount.findFirst).not.toHaveBeenCalled()
  expect(prisma.$transaction).not.toHaveBeenCalled()
})
it('returns no account or journal data to a non-owner', async () => {
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com' } })
  jest.mocked(prisma.tradingAccount.findFirst).mockResolvedValue(null)
  jest.mocked(prisma.tradeJournal.findFirst).mockResolvedValue(null)
  const responses = await Promise.all([getBooks(request()), getLink(request()), getWeek(request()), getHealth(request())])
  expect(responses.map(response => response.status)).toEqual([404,404,404,404])
  expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', userId: 'owner' } }))
  expect(prisma.tradeJournal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: '', account: { userId: 'owner' } } }))
})
