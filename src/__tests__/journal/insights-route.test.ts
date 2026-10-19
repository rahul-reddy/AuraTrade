import { NextRequest } from 'next/server'
import { GET } from '@/app/api/insights/route'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
jest.mock('@/lib/session', () => ({ getRequiredSession: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { tradingAccount: { findFirst: jest.fn() }, roundTripTrade: { findMany: jest.fn() } } }))

beforeEach(() => jest.resetAllMocks())
it('authenticates before reading account data', async () => {
  jest.mocked(getRequiredSession).mockRejectedValue(new Response('Unauthorized', { status: 401 }))
  expect((await GET(new NextRequest('https://app.example/api/insights?accountId=other'))).status).toBe(401)
  expect(prisma.tradingAccount.findFirst).not.toHaveBeenCalled()
})
it('rejects another user account before fetching its trades', async () => {
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com' } })
  jest.mocked(prisma.tradingAccount.findFirst).mockResolvedValue(null)
  expect((await GET(new NextRequest('https://app.example/api/insights?accountId=other'))).status).toBe(404)
  expect(prisma.tradingAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'other', userId: 'owner' }, select: { id: true } })
  expect(prisma.roundTripTrade.findMany).not.toHaveBeenCalled()
})
