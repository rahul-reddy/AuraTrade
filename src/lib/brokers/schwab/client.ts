import { z } from 'zod'
import { configuration } from './crypto'

export class SchwabError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expiresAt: z.number() })
export const accountsSchema = z.array(z.object({ hashValue: z.string().min(1), label: z.string() })).max(100)

export async function exchange(form: URLSearchParams, previousRefresh?: string) {
  const config = configuration()
  const response = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  })
  if (!response.ok) throw new SchwabError(409, 'Schwab authorization failed. Check app approval and reconnect.')
  const body = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().positive().max(86400), token_type: z.string() }).parse(await response.json())
  if (body.token_type.toLowerCase() !== 'bearer' || !(body.refresh_token ?? previousRefresh)) throw new SchwabError(502, 'Schwab returned an unsupported token response.')
  return tokensSchema.parse({ ...body, refresh_token: body.refresh_token ?? previousRefresh, expiresAt: Date.now() + body.expires_in * 1000 })
}

// Explicit allow-list: this client cannot send trading/order requests, even if
// the Schwab product's consent includes trading capabilities.
export async function brokerGet(access: string, path: string): Promise<unknown> {
  if (!/^accounts\/accountNumbers$|^accounts\/[A-Za-z0-9_-]+\/transactions\?/.test(path)) throw new Error('Unsupported broker endpoint.')
  const response = await fetch(`https://api.schwabapi.com/trader/v1/${path}`, {
    headers: { Authorization: `Bearer ${access}` }, cache: 'no-store', signal: AbortSignal.timeout(20000),
  })
  if (response.status === 401 || response.status === 403) throw new SchwabError(409, 'Schwab access expired or was denied. Reconnect your account.')
  if (!response.ok) throw new SchwabError(502, 'Schwab could not complete the request. Please try again later.')
  // Never include upstream response bodies, URLs, account numbers or headers in
  // exceptions/logging. Limit response size before parsing source data.
  const reader = response.body?.getReader()
  if (!reader) throw new SchwabError(502, 'Schwab returned an empty response.')
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > 8_000_000) { await reader.cancel(); throw new SchwabError(422, 'Broker response is too large; use a CSV export for this period.') }
    chunks.push(next.value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
