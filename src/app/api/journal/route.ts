import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { journalSchema, JournalError } from '@/lib/journal/contracts'
import { loadJournal, saveJournal } from '@/lib/journal/store'
import { assertSameOrigin, journalResponseError, readJson } from '@/lib/journal/http'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const params = new URL(request.url).searchParams
    const tradeId = params.get('tradeId') || undefined
    const journalId = params.get('journalId') || undefined
    if (!!tradeId === !!journalId) throw new JournalError(400, 'invalid_request', 'Choose a trade or journal.')
    return NextResponse.json(await loadJournal(session.user.id, { tradeId, journalId }), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const input = journalSchema.parse(await readJson(request))
    return NextResponse.json(await saveJournal(session.user.id, input), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return journalResponseError(error) }
}
