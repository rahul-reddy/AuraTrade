import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { JournalError } from './contracts'

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  // Next's production server can reconstruct request.url with an internal host.
  // Compare the browser origin to the incoming Host header instead, preserving
  // the port. Caddy supplies the public Host when proxying production requests.
  let matches = true
  if (origin) {
    try {
      const parsed = new URL(origin)
      matches = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === (request.headers.get('host') ?? request.nextUrl.host)
    } catch { matches = false }
  }
  if (!matches || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new JournalError(403, 'forbidden', 'This request is not allowed.')
  }
}

export async function readBody(request: NextRequest, maxBytes = 256000): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new JournalError(413, 'too_large', 'The upload is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new JournalError(400, 'invalid_request', 'The request is empty.')
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) { await reader.cancel(); throw new JournalError(413, 'too_large', 'The upload is too large.') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const bytes = await readBody(request)
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown } catch {
    throw new JournalError(400, 'invalid_request', 'The request is not valid JSON.')
  }
}

export function journalResponseError(error: unknown) {
  if (error instanceof Response) return error
  if (error instanceof ZodError) return NextResponse.json({ error: 'invalid_request', message: 'Check the field lengths, labels, and price (up to 4 decimal places).' }, { status: 400 })
  if (error instanceof JournalError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status })
  // User writing and upstream exception details never enter logs or responses.
  return NextResponse.json({ error: 'internal_error', message: 'Could not complete this request. Your changes have not been saved. Please retry.' }, { status: 500 })
}
