interface DisplayTradeQuantityInput {
  isOpen: boolean
  totalQty: number
  remainingQty: number
}

export function getDisplayTradeQuantity({
  isOpen,
  totalQty,
  remainingQty,
}: DisplayTradeQuantityInput): number {
  return isOpen ? remainingQty : totalQty
}
