import { brokerGet, exchange } from '@/lib/brokers/schwab/client'

const originalFetch = global.fetch
beforeEach(() => {
  process.env.SCHWAB_CLIENT_ID = 'synthetic-client'
  process.env.SCHWAB_CLIENT_SECRET = 'synthetic-secret'
  process.env.SCHWAB_TOKEN_KEY = 'ab'.repeat(32)
  global.fetch = jest.fn()
})
afterAll(() => { global.fetch = originalFetch })
test('client disallows order and arbitrary outbound endpoints', async () => {
  for (const path of ['accounts/hash/orders', 'https://untrusted.example', '../orders']) await expect(brokerGet('synthetic-access', path)).rejects.toThrow('Unsupported')
  expect(fetch).not.toHaveBeenCalled()
})
test('upstream errors never expose raw response bodies', async () => {
  jest.mocked(fetch).mockResolvedValue(new Response('synthetic-private-response', { status: 500 }))
  await expect(brokerGet('synthetic-access', 'accounts/accountNumbers')).rejects.toThrow('could not complete')
  jest.mocked(fetch).mockResolvedValue(new Response('synthetic-private-response', { status: 401 }))
  await expect(brokerGet('synthetic-access', 'accounts/accountNumbers')).rejects.toThrow('Reconnect')
})
test('token exchange preserves a refresh token when omitted and never sends it in a URL', async () => {
  jest.mocked(fetch).mockResolvedValue(Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 1800 }))
  const token = await exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'synthetic-refresh' }), 'synthetic-refresh')
  expect(token.refresh_token).toBe('synthetic-refresh')
  expect(fetch).toHaveBeenCalledWith('https://api.schwabapi.com/v1/oauth/token', expect.objectContaining({ method: 'POST', cache: 'no-store' }))
})
