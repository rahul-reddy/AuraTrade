import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequiredSession } from '@/lib/session'
import { assertSameOrigin, readJson } from '@/lib/journal/http'
import { beginConnection, bindAccount, connectionStatus, syncAction } from '@/lib/brokers/schwab/service'
import { SchwabError } from '@/lib/brokers/schwab/client'
import { JournalError } from '@/lib/journal/contracts'

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect') }),
  z.object({ action: z.literal('bind'), index: z.number().int().min(0).max(99), accountId: z.string().min(1).max(100), acknowledged: z.literal(true) }),
  z.object({ action: z.literal('preview') }),
  z.object({ action: z.literal('confirm'), hash: z.string().length(64), autoSync: z.boolean() }),
  z.object({ action: z.literal('disconnect') }),
  z.object({ action: z.literal('pause') }),
])

function failure(error: unknown) {
  if (error instanceof Response) return error
  if (error instanceof SchwabError || error instanceof JournalError) return NextResponse.json({ message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ message: 'Could not complete the Schwab request. Check configuration or try again. No partial import was saved.' }, { status: 400 })
}

export async function GET() {
  try {
    const session = await getRequiredSession()
    return NextResponse.json(await connectionStatus(session.user.id), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = inputSchema.parse(await readJson(request))
    if (input.action === 'connect') {
      const result = await beginConnection(session.user.id)
      const response = NextResponse.json({ url: result.url }, { headers: { 'Cache-Control': 'no-store' } })
      response.cookies.set('schwab_oauth_state', result.state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/brokers/schwab', maxAge: 600 })
      return response
    }
    if (input.action === 'bind') await bindAccount(session.user.id, input.index, input.accountId)
    else await syncAction(session.user.id, input.action, input.action === 'confirm' ? input.hash : undefined, input.action === 'confirm' && input.autoSync)
    return NextResponse.json(await connectionStatus(session.user.id), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
