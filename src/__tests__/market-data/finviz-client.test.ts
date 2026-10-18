import { parseFinvizDailyCsv, fetchFinvizDaily } from '@/lib/market-data/finviz-client'
const csv = 'Date,Open,High,Low,Close,Volume\n10/16/2026,101,105,100,104,1200\n10/15/2026,100,103,98,101,1000\n'
describe('Finviz daily export', () => {
  it('reads the verified export columns and sorts calendar dates', () => {
    expect(parseFinvizDailyCsv(csv)).toEqual([
      {time:'2026-10-15T00:00:00.000Z',open:100,high:103,low:98,close:101,volume:1000},
      {time:'2026-10-16T00:00:00.000Z',open:101,high:105,low:100,close:104,volume:1200},
    ])
  })
  it.each(['<html>Sign in</html>', 'Date,Open,High,Low,Close,Volume\n', csv.replace('10/16/2026','02/30/2026'), csv.replace(',104,',',999,'), csv.replace(',1200',',-1'), csv.replace(',101,105',',,105'), csv + '10/16/2026,101,105,100,104,1200'])('rejects missing, duplicate or malformed upstream prices', value => {
    expect(() => parseFinvizDailyCsv(value)).toThrow()
  })
  it('keeps the key on the fixed official host and returns only the requested range', async () => {
    const fetcher = jest.fn().mockResolvedValue({ok:true,text:async()=>csv})
    const candles = await fetchFinvizDaily({symbol:'AAPL',from:new Date('2026-10-16'),to:new Date('2026-10-16T23:59:59Z')}, {token:'synthetic-private-token',fetcher:fetcher as unknown as typeof fetch})
    expect(candles).toHaveLength(1)
    const url = fetcher.mock.calls[0][0] as URL
    expect(url.origin).toBe('https://elite.finviz.com')
    expect(url.pathname).toBe('/quote_export')
    expect(fetcher.mock.calls[0][1]).toMatchObject({cache:'no-store',redirect:'error'})
  })
  it('discards upstream exception details that could expose the private token', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('https://elite.finviz.com/?auth=synthetic-private-token'))
    await expect(fetchFinvizDaily({symbol:'AAPL',from:new Date('2026-10-15'),to:new Date('2026-10-16')},{token:'synthetic-private-token',fetcher:fetcher as unknown as typeof fetch})).rejects.toThrow('finviz_market_data_unavailable')
    try { await fetchFinvizDaily({symbol:'AAPL',from:new Date('2026-10-15'),to:new Date('2026-10-16')},{token:'synthetic-private-token',fetcher:fetcher as unknown as typeof fetch}) } catch(error) { expect(String(error)).not.toContain('synthetic-private-token'); expect((error as Error).cause).toBeUndefined() }
  })
})
