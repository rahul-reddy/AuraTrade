import type { Prisma } from '@/generated/prisma'
import { rebuildTradesForAccount } from '@/lib/engine/account-rebuild'

describe('rebuildTradesForAccount', () => {
  test('preserves broker-ledger trades while rebuilding execution-backed trades', async () => {
    const executionUpdateMany = jest.fn().mockResolvedValue({ count: 0 })
    const roundTripTradeDeleteMany = jest.fn().mockResolvedValue({ count: 0 })
    const executionFindMany = jest.fn().mockResolvedValue([])

    const tx = {
      execution: {
        updateMany: executionUpdateMany,
        findMany: executionFindMany,
      },
      roundTripTrade: {
        deleteMany: roundTripTradeDeleteMany,
      },
    } as unknown as Prisma.TransactionClient

    await rebuildTradesForAccount(tx, 'acct_1')

    expect(roundTripTradeDeleteMany).toHaveBeenCalledWith({
      where: {
        accountId: 'acct_1',
        brokerStatementPositionId: null,
      },
    })
  })
})
