import type { PrismaClient } from '@/generated/prisma'
import { persistBrokerStatementImport } from '@/lib/parser/broker-statement-store'
import { analyzeSchwabStatement } from '@/lib/parser/schwab-statement-analyzer'
import { buildBrokerPositionLedger } from '@/lib/engine/broker-position-ledger'

function makeCsv(rows: string[]): string {
  const header = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount'
  return [header, ...rows].join('\n')
}

describe('persistBrokerStatementImport', () => {
  it('creates a broker statement import and stores normalized row metadata', async () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '2/4/2026,Buy to Open,ORCL 08/21/2026 150.00 C,CALL ORACLE CORP $150 EXP 08/21/26,1,"$25.00 ","$0.66 ","($2,500.66)"',
        '5/14/2024,Journaled Shares,CLSK,TDA TRAN - TRANSFER OF SECURITY OR OPTION OUT (CLSK),10,,,',
      ]),
    )
    const ledger = buildBrokerPositionLedger(dryRun.rows)

    const findUnique = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({ id: 'stmt_1' })
    const update = jest.fn()
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    const createMany = jest.fn().mockResolvedValue({ count: dryRun.rows.length })
    const deleteManyPositions = jest.fn().mockResolvedValue({ count: 0 })
    const createManyPositions = jest.fn().mockResolvedValue({ count: ledger.positions.length })
    const deleteManyWarnings = jest.fn().mockResolvedValue({ count: 0 })
    const createManyWarnings = jest.fn().mockResolvedValue({ count: ledger.warnings.length })

    const db = {
      brokerStatementImport: { findUnique, create, update },
      brokerStatementRow: { deleteMany, createMany },
      brokerStatementPosition: {
        deleteMany: deleteManyPositions,
        createMany: createManyPositions,
      },
      brokerStatementWarning: {
        deleteMany: deleteManyWarnings,
        createMany: createManyWarnings,
      },
    } as unknown as PrismaClient

    const result = await persistBrokerStatementImport(db, {
      userId: 'user_1',
      accountId: 'acct_1',
      fileHash: 'hash_1',
      fileName: 'statement.csv',
      dryRun,
      ledger,
    })

    expect(result).toEqual({ statementImportId: 'stmt_1' })
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        accountId_fileHash: {
          accountId: 'acct_1',
          fileHash: 'hash_1',
        },
      },
      select: { id: true },
    })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        accountId: 'acct_1',
        fileHash: 'hash_1',
        fileName: 'statement.csv',
        importSupported: false,
        blockedTradeRows: 1,
        positionAffectingNonTradeRows: 1,
        optionRows: 1,
      }),
      select: { id: true },
    })
    expect(deleteMany).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_1' },
    })
    expect(deleteManyPositions).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_1' },
    })
    expect(deleteManyWarnings).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_1' },
    })
    expect(createMany).toHaveBeenCalledTimes(1)
    expect(createManyPositions).toHaveBeenCalledTimes(1)

    const createManyArg = createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>
    }
    expect(createManyArg.data).toHaveLength(2)
    expect(createManyArg.data[0]).toMatchObject({
      statementImportId: 'stmt_1',
      rowIndex: 0,
      action: 'Journaled Shares',
      symbol: 'CLSK',
      instrumentType: 'EQUITY',
      actionCategory: 'POSITION_TRANSFER',
      isImportTradeRow: false,
      blocksCanonicalImport: true,
      optionUnderlying: null,
      optionType: null,
      optionMultiplier: null,
    })
    expect(createManyArg.data[1]).toMatchObject({
      statementImportId: 'stmt_1',
      rowIndex: 1,
      action: 'Buy to Open',
      symbol: 'ORCL 08/21/2026 150.00 C',
      instrumentType: 'OPTION',
      actionCategory: 'OPTION_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: true,
      optionUnderlying: 'ORCL',
      optionType: 'CALL',
      optionMultiplier: 100,
    })

    const createManyPositionsArg = createManyPositions.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>
    }
    expect(createManyPositionsArg.data).toHaveLength(1)
    expect(createManyPositionsArg.data[0]).toMatchObject({
      statementImportId: 'stmt_1',
      instrumentKey: 'OPTION:ORCL 08/21/2026 150.00 C',
      instrumentType: 'OPTION',
      side: 'LONG',
      multiplier: 100,
      remainingQty: expect.anything(),
    })
  })

  it('updates an existing statement import and replaces stored rows', async () => {
    const dryRun = analyzeSchwabStatement(
      makeCsv([
        '3/12/2026,Buy,NBIS,NEBIUS GROUP N V,10,"$107.23 ",,"($1,072.29)"',
      ]),
    )
    const ledger = buildBrokerPositionLedger(dryRun.rows)

    const findUnique = jest.fn().mockResolvedValue({ id: 'stmt_existing' })
    const update = jest.fn().mockResolvedValue({ id: 'stmt_existing' })
    const create = jest.fn()
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 })
    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    const deleteManyPositions = jest.fn().mockResolvedValue({ count: 1 })
    const createManyPositions = jest.fn().mockResolvedValue({ count: 1 })
    const deleteManyWarnings = jest.fn().mockResolvedValue({ count: 1 })
    const createManyWarnings = jest.fn().mockResolvedValue({ count: 0 })

    const db = {
      brokerStatementImport: { findUnique, create, update },
      brokerStatementRow: { deleteMany, createMany },
      brokerStatementPosition: {
        deleteMany: deleteManyPositions,
        createMany: createManyPositions,
      },
      brokerStatementWarning: {
        deleteMany: deleteManyWarnings,
        createMany: createManyWarnings,
      },
    } as unknown as PrismaClient

    const result = await persistBrokerStatementImport(db, {
      userId: 'user_1',
      accountId: 'acct_1',
      fileHash: 'hash_1',
      fileName: 'statement.csv',
      dryRun,
      ledger,
    })

    expect(result).toEqual({ statementImportId: 'stmt_existing' })
    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({
      where: { id: 'stmt_existing' },
      data: expect.objectContaining({
        importSupported: true,
        importableTradeRows: 1,
        blockedTradeRows: 0,
      }),
      select: { id: true },
    })
    expect(deleteMany).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_existing' },
    })
    expect(deleteManyPositions).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_existing' },
    })
    expect(deleteManyWarnings).toHaveBeenCalledWith({
      where: { statementImportId: 'stmt_existing' },
    })
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          statementImportId: 'stmt_existing',
          rowIndex: 0,
          action: 'Buy',
          instrumentType: 'EQUITY',
          actionCategory: 'EQUITY_TRADE',
          blocksCanonicalImport: false,
        }),
      ],
    })
    expect(createManyPositions).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          statementImportId: 'stmt_existing',
          instrumentKey: 'EQUITY:NBIS',
          instrumentType: 'EQUITY',
          isOpen: true,
          remainingQty: expect.anything(),
        }),
      ],
    })
    expect(createManyWarnings).not.toHaveBeenCalled()
  })
})
