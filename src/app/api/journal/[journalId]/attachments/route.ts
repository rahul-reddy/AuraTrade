import { NextRequest, NextResponse } from 'next/server'
import { getRequiredSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { lockAccountLedger } from '@/lib/engine/account-ledger-rebuild'
import { imageContentType, JournalError, MAX_ACCOUNT_IMAGE_BYTES, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from '@/lib/journal/contracts'
import { assertSameOrigin, journalResponseError, readBody } from '@/lib/journal/http'
import { attachmentSelect } from '@/lib/journal/store'

export async function POST(request: NextRequest, context: { params: Promise<{ journalId: string }> }) {
  try {
    const session = await getRequiredSession()
    assertSameOrigin(request)
    const { journalId } = await context.params
    const owner = await prisma.tradeJournal.findFirst({ where: { id: journalId, account: { userId: session.user.id } }, select: { accountId: true } })
    if (!owner) throw new JournalError(404, 'not_found', 'Journal not found.')
    const bytes = await readBody(request, MAX_IMAGE_BYTES)
    const contentType = imageContentType(bytes)
    if (!contentType || request.headers.get('content-type') !== contentType) throw new JournalError(400, 'invalid_image', 'Choose a PNG, JPEG, or WebP image up to 3 MB.')
    const result = await prisma.$transaction(async tx => {
      await lockAccountLedger(tx, owner.accountId)
      const journal = await tx.tradeJournal.findFirst({ where: { id: journalId, accountId: owner.accountId, account: { userId: session.user.id } } })
      if (!journal) throw new JournalError(404, 'not_found', 'Journal not found.')
      const count = await tx.journalAttachment.count({ where: { journalId, journal: { account: { userId: session.user.id } } } })
      const usage = await tx.journalAttachment.aggregate({ where: { journal: { accountId: owner.accountId, account: { userId: session.user.id } } }, _sum: { byteSize: true } })
      if (count >= MAX_ATTACHMENTS) throw new JournalError(400, 'attachment_limit', 'Each journal supports up to 5 screenshots.')
      if ((usage._sum.byteSize ?? 0) + bytes.length > MAX_ACCOUNT_IMAGE_BYTES) throw new JournalError(400, 'storage_limit', 'This account has reached its 100 MB screenshot limit. Remove older screenshots to add more.')
      return tx.journalAttachment.create({ data: { journalId, contentType, byteSize: bytes.length, data: new Uint8Array(bytes) }, select: attachmentSelect })
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) { return journalResponseError(error) }
}
