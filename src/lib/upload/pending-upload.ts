import type { Prisma, PrismaClient } from '@/generated/prisma'

type UploadWriteClient = Pick<PrismaClient, 'upload'>

interface PendingUploadIdentity {
  userId: string
  accountId: string
  fileHash: string
}

type PendingUploadData = PendingUploadIdentity &
  Pick<
    Prisma.UploadUncheckedCreateInput,
    | 'fileName'
    | 'status'
    | 'totalRows'
    | 'newRows'
    | 'skippedRows'
    | 'dateFrom'
    | 'dateTo'
    | 'warnings'
  >

export async function createOrReusePendingUpload(
  db: UploadWriteClient,
  data: PendingUploadData,
): Promise<{ id: string }> {
  const existing = await db.upload.findUnique({
    where: {
      accountId_fileHash: {
        accountId: data.accountId,
        fileHash: data.fileHash,
      },
    },
    select: { id: true, status: true },
  })

  if (existing) {
    // Reuse a COMPLETE upload as-is (the caller already checked for duplicate
    // files and returned 409 before reaching here, so this path is a no-op
    // that prevents a guaranteed unique-key crash).
    if (existing.status === 'COMPLETE') {
      return { id: existing.id }
    }
    return db.upload.update({
      where: { id: existing.id },
      data: {
        fileName: data.fileName,
        status: data.status,
        totalRows: data.totalRows,
        newRows: data.newRows,
        skippedRows: data.skippedRows,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        warnings: data.warnings,
        completedAt: null,
      },
      select: { id: true },
    })
  }

  // Guard against a concurrent insert racing past the findUnique above.
  try {
    return await db.upload.create({ data, select: { id: true } })
  } catch (err) {
    const isPrismaUniqueViolation =
      err != null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    if (isPrismaUniqueViolation) {
      const row = await db.upload.findUnique({
        where: {
          accountId_fileHash: {
            accountId: data.accountId,
            fileHash: data.fileHash,
          },
        },
        select: { id: true },
      })
      if (row) return row
    }
    throw err
  }
}
