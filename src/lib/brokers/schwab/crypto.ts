import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export function hash(value: string) { return createHash('sha256').update(value).digest('hex') }

function key() {
  const value = process.env.SCHWAB_TOKEN_KEY ?? ''
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Schwab encryption is not configured.')
  return Buffer.from(value, 'hex')
}

// Bind every ciphertext to its user and purpose; a copied DB value cannot be
// decrypted as another user's credentials or substituted into another column.
export function seal(userId: string, purpose: string, value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(`${userId}:${purpose}`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.')
}

export function unseal(userId: string, purpose: string, value: string): unknown {
  const parts = value.split('.')
  if (parts.length !== 3) throw new Error('Invalid broker ciphertext.')
  const [iv, tag, data] = parts.map(part => Buffer.from(part, 'base64url'))
  const cipher = createDecipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(`${userId}:${purpose}`))
  cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')) as unknown
}

export function configuration() {
  const clientId = process.env.SCHWAB_CLIENT_ID
  const secret = process.env.SCHWAB_CLIENT_SECRET
  const callback = process.env.SCHWAB_REDIRECT_URI ?? 'https://auratrades.quest/api/brokers/schwab/callback'
  if (!clientId || !secret || new URL(callback).protocol !== 'https:') throw new Error('Schwab is not configured.')
  key()
  return { clientId, secret, callback }
}
