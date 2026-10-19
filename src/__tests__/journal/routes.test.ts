import { NextRequest } from 'next/server'
import { GET, PUT } from '@/app/api/journal/route'
import { GET as getReview, PUT as putReview } from '@/app/api/review/route'
import { POST as postImage } from '@/app/api/journal/[journalId]/attachments/route'
import { GET as getImage, DELETE as deleteImage } from '@/app/api/journal/attachments/[id]/route'
import { getRequiredSession } from '@/lib/session'
import { loadJournal, saveJournal } from '@/lib/journal/store'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/journal/http'
jest.mock('@/lib/session', () => ({ getRequiredSession: jest.fn() }))
jest.mock('@/lib/journal/store', () => ({ loadJournal: jest.fn(), saveJournal: jest.fn(), attachmentSelect: { id: true } }))
jest.mock('@/lib/prisma', () => ({ prisma: { tradingAccount: { findFirst: jest.fn() }, journalAttachment: { findFirst: jest.fn(), deleteMany: jest.fn() }, tradeJournal: { findFirst: jest.fn() } } }))

beforeEach(() => jest.resetAllMocks())
it('validates the incoming public host when Next reconstructs an internal URL', () => {
  expect(() => assertSameOrigin(new NextRequest('http://localhost:3100/api/journal', { headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100', 'sec-fetch-site': 'same-origin' } }))).not.toThrow()
  expect(() => assertSameOrigin(new NextRequest('http://localhost:3100/api/journal', { headers: { host: '127.0.0.1:3100', origin: 'http://foreign.example' } }))).toThrow('This request is not allowed.')
})
const request = (method = 'GET') => new NextRequest('https://app.example/api/journal?tradeId=private-trade', { method })

it('authenticates every journal, review, and image handler before reading data or body', async () => {
  jest.mocked(getRequiredSession).mockRejectedValue(new Response('Unauthorized', { status: 401 }))
  const responses = await Promise.all([GET(request()), PUT(request('PUT')), getReview(request()), putReview(request('PUT')), postImage(request('POST'), { params: Promise.resolve({ journalId: 'j' }) }), getImage(request(), { params: Promise.resolve({ id: 'a' }) }), deleteImage(request('DELETE'), { params: Promise.resolve({ id: 'a' }) })])
  expect(responses.map(response => response.status)).toEqual([401,401,401,401,401,401,401])
  expect(loadJournal).not.toHaveBeenCalled()
  expect(prisma.tradingAccount.findFirst).not.toHaveBeenCalled()
  expect(prisma.journalAttachment.findFirst).not.toHaveBeenCalled()
})

it('passes only the signed-in user to journal loading and hides exception details', async () => {
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'user-a', email: 'a@example.com' } })
  jest.mocked(loadJournal).mockRejectedValue(new Error('synthetic-private-writing'))
  const result = await GET(request())
  expect(loadJournal).toHaveBeenCalledWith('user-a', { tradeId: 'private-trade', journalId: undefined })
  expect(result.status).toBe(500)
  expect(await result.text()).not.toContain('synthetic-private-writing')
})

it('rejects cross-origin journal writes before reading or persisting the payload', async () => {
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'user-a', email: 'a@example.com' } })
  const result = await PUT(new NextRequest('https://app.example/api/journal', { method: 'PUT', headers: { Origin: 'https://other.example' }, body: '{}' }))
  expect(result.status).toBe(403)
  expect(saveJournal).not.toHaveBeenCalled()
})

it('scopes image retrieval and deletion to journal account ownership', async () => {
  jest.mocked(getRequiredSession).mockResolvedValue({ user: { id: 'user-a', email: 'a@example.com' } })
  jest.mocked(prisma.journalAttachment.findFirst).mockResolvedValue(null)
  jest.mocked(prisma.journalAttachment.deleteMany).mockResolvedValue({ count: 0 })
  expect((await getImage(request(), { params: Promise.resolve({ id: 'foreign-image' }) })).status).toBe(404)
  expect((await deleteImage(request('DELETE'), { params: Promise.resolve({ id: 'foreign-image' }) })).status).toBe(404)
  expect(prisma.journalAttachment.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-image', journal: { account: { userId: 'user-a' } } } })
  expect(prisma.journalAttachment.deleteMany).toHaveBeenCalledWith({ where: { id: 'foreign-image', journal: { account: { userId: 'user-a' } } } })
})
