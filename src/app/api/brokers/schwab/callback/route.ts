import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { configuration } from '@/lib/brokers/schwab/crypto'
import { finishConnection } from '@/lib/brokers/schwab/service'

export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession()
    const p = request.nextUrl.searchParams
    if (p.has('error')) throw new Error('Authorization denied.')
    await finishConnection(session.user.id, p.get('state') ?? '', request.cookies.get('schwab_oauth_state')?.value, p.get('code') ?? '')
    const response = NextResponse.redirect(new URL('/settings/connections?schwab=connected', configuration().callback), 303)
    response.cookies.set('schwab_oauth_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/brokers/schwab', maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    if (error instanceof Response) return error
    // Fixed destination and fixed error, never echo codes or upstream data.
    const target = new URL('/settings/connections?schwab=failed', process.env.SCHWAB_REDIRECT_URI ?? 'https://auratrades.quest')
    const response = NextResponse.redirect(target, 303)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.cookies.set('schwab_oauth_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/brokers/schwab', maxAge: 0 })
    return response
  }
}
