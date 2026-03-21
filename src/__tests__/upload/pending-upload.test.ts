import type { PrismaClient } from '@/generated/prisma'
import { createOrReusePendingUpload } from '@/lib/upload/pending-upload'

describe('createOrReusePendingUpload', () => {
  it('creates a fresh pending upload when no matching file exists', async () => {
    const findUnique = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({ id: 'upload_new' })
    const update = jest.fn()

    const db = {
      upload: { findUnique, create, update },
    } as unknown as PrismaClient

    const result = await createOrReusePendingUpload(db, {
      userId: 'user_1',
      accountId: 'acct_1',
      fileHash: 'hash_1',
      fileName: 'statement.csv',
      status: 'PENDING',
      totalRows: 12,
      newRows: 8,
      skippedRows: 0,
      dateFrom: new Date('2026-02-01T00:00:00.000Z'),
      dateTo: new Date('2026-02-04T00:00:00.000Z'),
      warnings: ['warning 1'],
    })

    expect(result).toEqual({ id: 'upload_new' })
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        accountId_fileHash: {
          accountId: 'acct_1',
          fileHash: 'hash_1',
        },
      },
      select: { id: true, status: true },
    })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        accountId: 'acct_1',
        fileHash: 'hash_1',
        fileName: 'statement.csv',
        status: 'PENDING',
        totalRows: 12,
        newRows: 8,
        skippedRows: 0,
        warnings: ['warning 1'],
      }),
      select: { id: true },
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('reuses an existing pending upload for the same file hash instead of creating a duplicate row', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'upload_existing', status: 'PENDING' })
    const create = jest.fn()
    const update = jest.fn().mockResolvedValue({ id: 'upload_existing' })

    const db = {
      upload: { findUnique, create, update },
    } as unknown as PrismaClient

    const result = await createOrReusePendingUpload(db, {
      userId: 'user_1',
      accountId: 'acct_1',
      fileHash: 'hash_1',
      fileName: 'statement.csv',
      status: 'PENDING',
      totalRows: 20,
      newRows: 9,
      skippedRows: 1,
      dateFrom: new Date('2026-01-01T00:00:00.000Z'),
      dateTo: new Date('2026-03-01T00:00:00.000Z'),
      warnings: ['warning 1', 'warning 2'],
    })

    expect(result).toEqual({ id: 'upload_existing' })
    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({
      where: { id: 'upload_existing' },
      data: expect.objectContaining({
        fileName: 'statement.csv',
        status: 'PENDING',
        totalRows: 20,
        newRows: 9,
        skippedRows: 1,
        warnings: ['warning 1', 'warning 2'],
        completedAt: null,
      }),
      select: { id: true },
    })
  })
})
