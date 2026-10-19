import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin, journalResponseError } from '@/lib/journal/http'
import { JournalError } from '@/lib/journal/contracts'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession()
    const { id } = await context.params
    const attachment = await prisma.journalAttachment.findFirst({ where: { id, journal: { account: { userId: session.user.id } } } })
    if (!attachment) throw new JournalError(404, 'not_found', 'Screenshot not found.')
    const extension = attachment.contentType === 'image/png' ? 'png' : attachment.contentType === 'image/jpeg' ? 'jpg' : 'webp'
    return new NextResponse(new Uint8Array(attachment.data), { headers: {
      'Content-Type': attachment.contentType, 'Content-Length': String(attachment.byteSize),
      'Content-Disposition': `inline; filename="journal-screenshot.${extension}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } })
  } catch (error) { return journalResponseError(error) }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const { id } = await context.params
    const result = await prisma.journalAttachment.deleteMany({ where: { id, journal: { account: { userId: session.user.id } } } })
    if (!result.count) throw new JournalError(404, 'not_found', 'Screenshot not found.')
    return new NextResponse(null, { status: 204 })
  } catch (error) { return journalResponseError(error) }
}
