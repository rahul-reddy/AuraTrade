import { getDisplayTradeQuantity } from '@/lib/trades/trade-quantity'

describe('getDisplayTradeQuantity', () => {
  test('uses remaining quantity for open trades', () => {
    expect(
      getDisplayTradeQuantity({
        isOpen: true,
        totalQty: 350,
        remainingQty: 242,
      }),
    ).toBe(242)
  })

  test('uses total quantity for closed trades', () => {
    expect(
      getDisplayTradeQuantity({
        isOpen: false,
        totalQty: 350,
        remainingQty: 0,
      }),
    ).toBe(350)
  })
})
