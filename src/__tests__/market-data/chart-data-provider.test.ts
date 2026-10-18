import { fetchChartMarketData } from '@/lib/market-data/chart-data-provider'
import { fetchFinvizDaily } from '@/lib/market-data/finviz-client'
import { fetchYahooMarketData } from '@/lib/market-data/yahoo-client'
jest.mock('@/lib/market-data/finviz-client',()=>({fetchFinvizDaily:jest.fn()}))
jest.mock('@/lib/market-data/yahoo-client',()=>({...jest.requireActual('@/lib/market-data/yahoo-client'),fetchYahooMarketData:jest.fn()}))
const original = process.env.AURATRADE_FINVIZ_TOKEN
const options = {symbol:'AAPL',timeframe:'1d' as const,from:new Date('2026-10-01'),to:new Date('2026-10-16')}
beforeEach(()=>{jest.clearAllMocks();process.env.AURATRADE_FINVIZ_TOKEN='synthetic-private-token'})
afterAll(()=>{if(original===undefined)delete process.env.AURATRADE_FINVIZ_TOKEN;else process.env.AURATRADE_FINVIZ_TOKEN=original})
it('prefers configured Finviz for daily prices',async()=>{
  jest.mocked(fetchFinvizDaily).mockResolvedValue([{time:'2026-10-16T00:00:00Z',open:100,high:102,low:99,close:101,volume:1000}])
  expect((await fetchChartMarketData(options)).provider).toBe('finviz')
  expect(fetchYahooMarketData).not.toHaveBeenCalled()
})
it('falls back explicitly when Finviz fails without forwarding the exception',async()=>{
  jest.mocked(fetchFinvizDaily).mockRejectedValue(new Error('synthetic-private-token'))
  jest.mocked(fetchYahooMarketData).mockResolvedValue({symbol:'AAPL',requestedTimeframe:'1d',effectiveTimeframe:'1d',candles:[],fallbackMessage:null})
  const result=await fetchChartMarketData(options)
  expect(result.provider).toBe('yahoo')
  expect(result.fallbackMessage).toMatch(/Finviz unavailable/)
  expect(JSON.stringify(result)).not.toContain('synthetic-private-token')
})
it('uses Yahoo when no token is configured and for supported intraday requests',async()=>{
  delete process.env.AURATRADE_FINVIZ_TOKEN
  jest.mocked(fetchYahooMarketData).mockResolvedValue({symbol:'AAPL',requestedTimeframe:'1d',effectiveTimeframe:'1d',candles:[],fallbackMessage:null})
  await fetchChartMarketData(options)
  process.env.AURATRADE_FINVIZ_TOKEN='synthetic-private-token'
  await fetchChartMarketData({...options,timeframe:'1h',now:new Date('2026-10-18')})
  expect(fetchYahooMarketData).toHaveBeenCalledTimes(2)
  expect(fetchFinvizDaily).not.toHaveBeenCalled()
})
