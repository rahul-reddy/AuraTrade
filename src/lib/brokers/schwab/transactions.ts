import { z } from 'zod'
import Papa from 'papaparse'
import { Prisma } from '@/generated/prisma'
import { SchwabError } from './client'
import { analyzeBrokerStatement } from '@/lib/parser/analyze-broker-statement'

const decimal = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
const item = z.object({
  instrument: z.object({ assetType: z.string(), symbol: z.string().optional() }),
  amount: decimal, cost: decimal, price: decimal.optional(), feeType: z.string().optional(),
  fee: decimal.optional(), positionEffect: z.string().optional(),
})
const transaction = z.object({
  activityId: z.union([z.number().int().safe(), z.string().regex(/^\d+$/)]),
  type: z.string(), status: z.string(), tradeDate: z.string().optional(),
  time: z.string(), netAmount: decimal, transferItems: z.array(item),
})
const CASH_TYPES = new Set(['DIVIDEND_OR_INTEREST', 'ACH_RECEIPT', 'ACH_DISBURSEMENT', 'CASH_RECEIPT', 'CASH_DISBURSEMENT', 'ELECTRONIC_FUND', 'WIRE_OUT', 'WIRE_IN', 'MONEY_MARKET'])
const FEES = new Set(['COMMISSION', 'SEC_FEE', 'TAF_FEE', 'OPT_REG_FEE', 'INDEX_OPTION_FEE', 'BASE_CHARGE'])
const fail = () => new SchwabError(422, 'This batch contains an unsupported or ambiguous transaction. No trades were imported. Use a broker CSV preview or contact support.')

/**
 * Conservative API-to-existing-ledger bridge, not a new P&L engine.
 * Assumptions: signed security amount = share movement; tradeDate's calendar
 * component is the broker trading date; currency fee cost is the reported fee.
 * Trade time is deliberately date-only: transaction posting time is NOT a fill
 * timestamp. TOS statement fills retain their existing higher precedence.
 * Only single-leg USD equities with explicit fees and VALID status are accepted.
 * Fee total = sum(abs(currency fee cost)); no fee is derived from prices.
 * Cash reconciliation is validation only: signed share cost - fees = netAmount.
 * Unknown statuses, types, assets, adjustments, lifecycle events and fee layouts
 * reject the entire batch. Cash-only income/transfers do not affect trade P&L.
 */
export function transactionsToCsv(value: unknown, day: string): string {
  const parsed = z.array(transaction).max(2999).safeParse(value)
  if (!parsed.success) throw fail()
  if (parsed.data.some(t => Number.isNaN(Date.parse(t.time)))) throw fail()
  const rows: string[][] = []
  const seen = new Map<string, string>()
  // API list ordering is unspecified; use broker timestamps, then stable ID.
  // Posting time only orders same-day rows; it is never stored as fill time.
  const ordered = [...parsed.data].sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || new Prisma.Decimal(a.activityId).comparedTo(b.activityId))
  for (const tx of ordered) {
    const id = String(tx.activityId)
    const signature = JSON.stringify(tx)
    if (seen.has(id)) { if (seen.get(id) !== signature) throw fail(); continue }
    seen.set(id, signature)
    if (tx.status !== 'VALID') throw fail()
    if (CASH_TYPES.has(tx.type)) {
      if (tx.transferItems.some(i => i.instrument.assetType !== 'CURRENCY')) throw fail()
      continue
    }
    if (tx.type !== 'TRADE' || !tx.tradeDate?.startsWith(day) || Number.isNaN(Date.parse(tx.tradeDate))) throw fail()
    const equities = tx.transferItems.filter(i => i.instrument.assetType === 'EQUITY')
    const fees = tx.transferItems.filter(i => i.instrument.assetType === 'CURRENCY')
    if (equities.length !== 1 || fees.length === 0 || tx.transferItems.length !== equities.length + fees.length) throw fail()
    const stock = equities[0]
    if (!stock.instrument.symbol || !/^[A-Za-z0-9.\/-]{1,20}$/.test(stock.instrument.symbol) || stock.price == null) throw fail()
    if (stock.fee != null && !new Prisma.Decimal(stock.fee).isZero()) throw fail()
    if (stock.feeType && stock.feeType !== 'NONE') throw fail()
    if (!['OPENING', 'CLOSING'].includes(stock.positionEffect ?? '')) throw fail()
    const qty = new Prisma.Decimal(stock.amount)
    const price = new Prisma.Decimal(stock.price)
    if (qty.isZero() || !price.isPositive()) throw fail()
    if (qty.abs().gt('99999999.9999') || price.gt('99999999.9999') || qty.decimalPlaces() > 4 || price.decimalPlaces() > 4) throw fail()
    let totalFees = new Prisma.Decimal(0)
    const feeTypes = new Set<string>()
    for (const fee of fees) {
      if (!FEES.has(fee.feeType ?? '') || fee.instrument.symbol !== 'CURRENCY_USD' || feeTypes.has(fee.feeType!)) throw fail()
      if (fee.fee != null && !new Prisma.Decimal(fee.fee).isZero()) throw fail()
      feeTypes.add(fee.feeType!)
      totalFees = totalFees.plus(new Prisma.Decimal(fee.cost).abs())
    }
    if (totalFees.gt('999999.9999') || totalFees.decimalPlaces() > 4) throw fail()
    // Refuse absent fee breakdowns and representations that disagree with the
    // actual cash movement, rounded to USD cents. A one-cent tolerance would
    // silently accept an omitted penny of fees, so require exact agreement.
    const expected = qty.times(price).negated().minus(totalFees)
    if (!expected.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).equals(tx.netAmount)) throw fail()
    const action = qty.isPositive()
      ? stock.positionEffect === 'CLOSING' ? 'Buy to Cover' : 'Buy'
      : stock.positionEffect === 'OPENING' ? 'Sell Short' : 'Sell'
    const [year, month, date] = day.split('-')
    rows.push([`${month}/${date}/${year}`, action, stock.instrument.symbol, `Schwab API activity ${id}`, qty.abs().toString(), price.toString(), totalFees.toString(), String(tx.netAmount)])
  }
  return Papa.unparse({ fields: ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Fees & Comm', 'Amount'], data: rows })
}

export function analyzeApiCsv(csv: string, day: string) {
  const dryRun = analyzeBrokerStatement(csv)
  // API trades must NEVER claim ownership of historical lifecycle/event rows.
  // Only actual transaction-history CSVs provide events in the account ledger.
  dryRun.sourceFormat = 'SCHWAB_API'
  dryRun.coverage = { from: new Date(`${day}T00:00:00Z`), to: new Date(`${day}T00:00:00Z`) }
  dryRun.assumptions.push('Schwab API transaction tradeDate is date-only; posting timestamps are not execution times. Ordinary USD equity trades only; reported currency fee costs are required.')
  return dryRun
}
