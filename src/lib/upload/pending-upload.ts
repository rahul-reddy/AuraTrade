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

  if (existing && existing.status !== 'COMPLETE') {
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

  return db.upload.create({
    data,
    select: { id: true },
  })
}
