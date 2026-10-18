import { GET } from '@/app/api/market-data/route'
import { NextRequest } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { getMarketData } from '@/lib/market-data/market-data-cache'
jest.mock('@/lib/session',()=>({getRequiredSession:jest.fn()}))
jest.mock('@/lib/market-data/market-data-cache',()=>({getMarketData:jest.fn()}))
beforeEach(()=>jest.resetAllMocks())
it('requires authentication before accessing any prices',async()=>{
  jest.mocked(getRequiredSession).mockRejectedValue(new Response('Unauthorized',{status:401}))
  const result=await GET(new NextRequest('https://example.test/api/market-data?symbol=AAPL'))
  expect(result.status).toBe(401)
  expect(getMarketData).not.toHaveBeenCalled()
})
it('does not expose upstream exception details in responses or logs',async()=>{
  jest.mocked(getRequiredSession).mockResolvedValue({user:{id:'synthetic-user',email:'test@example.com'}})
  jest.mocked(getMarketData).mockRejectedValue(new Error('auth=synthetic-private-token'))
  const log=jest.spyOn(console,'error').mockImplementation(()=>{})
  try {
    const result=await GET(new NextRequest('https://example.test/api/market-data?symbol=AAPL'))
    expect(result.status).toBe(500)
    expect(await result.text()).not.toContain('synthetic-private-token')
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private-token')
  } finally {log.mockRestore()}
})
