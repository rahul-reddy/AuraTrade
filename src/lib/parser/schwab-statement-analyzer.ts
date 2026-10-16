import Papa from 'papaparse'
import { parse as parseDate } from 'date-fns'

export type StatementInstrumentType =
  | 'EQUITY'
  | 'OPTION'
  | 'CASH'
  | 'CORPORATE_ACTION'
  | 'UNKNOWN'

export type StatementActionCategory =
  | 'EQUITY_TRADE'
  | 'OPTION_TRADE'
  | 'OPTION_LIFECYCLE'
  | 'POSITION_TRANSFER'
  | 'INCOME'
  | 'CASH_TRANSFER'
  | 'CORPORATE_ACTION'
  | 'FEE'
  | 'UNKNOWN'

export interface OptionContractDetails {
  underlying: string
  expiration: string
  strike: number
  optionType: 'CALL' | 'PUT'
  quantityContracts: number | null
  multiplier: number | null
  underlyingEquivalentQty: number | null
}

export interface AnalyzedStatementRow {
  rowIndex: number
  raw: Record<string, string>
  date: Date | null
  action: string
  symbol: string
  description: string
  quantity: number | null
  price: number | null
  fees: number
  amount: number | null
  instrumentType: StatementInstrumentType
  actionCategory: StatementActionCategory
  optionContract: OptionContractDetails | null
  isImportTradeRow: boolean
  blocksCanonicalImport: boolean
  notes: string[]
}

export interface StatementActionBreakdown {
  action: string
  count: number
  category: StatementActionCategory
  importableCount: number
  blockedCount: number
  instrumentTypes: StatementInstrumentType[]
}

export type StatementSourceFormat =
  | 'SCHWAB_TRANSACTION_HISTORY'
  | 'TOS_ACCOUNT_STATEMENT'

export interface StatementDryRun {
  sourceFormat: StatementSourceFormat
  totalRows: number
  importableTradeRows: number
  blockedTradeRows: number
  nonTradeRows: number
  positionAffectingNonTradeRows: number
  optionRows: number
  skippedRows: number
  symbols: string[]
  dateRange: { from: Date; to: Date } | null
  /**
   * Trading dates the statement claims to cover, as UTC-midnight dates. Wider
   * than dateRange when the export period includes days without activity.
   */
  coverage: { from: Date; to: Date } | null
  warnings: string[]
  blockers: string[]
  assumptions: string[]
  actions: StatementActionBreakdown[]
  rows: AnalyzedStatementRow[]
  importSupported: boolean
}

const OPTION_SYMBOL_RE =
  /^(.+?) (\d{2}\/\d{2}\/\d{4}) (\d+(?:\.\d+)?) ([CP])$/

const INCOME_ACTIONS = new Set([
  'Cash Dividend',
  'Qualified Dividend',
  'Credit Interest',
  'Bond Interest',
  'Margin Interest',
  'Reinvest Shares',
  'Qual Div Reinvest',
  'Short Term Cap Gain Reinvest',
  'Long Term Cap Gain Reinvest',
  'Div Adjustment',
])

const CASH_TRANSFER_ACTIONS = new Set([
  'Internal Transfer',
  'MoneyLink Transfer',
  'Journal',
])

function parseMoney(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null
  const value = raw.trim()
  const isParenNegative = value.startsWith('(') && value.endsWith(')')
  const cleaned = value.replace(/[()$,\s]/g, '')
  const parsed = parseFloat(cleaned)
  if (Number.isNaN(parsed)) return null
  if (isParenNegative) return -Math.abs(parsed)
  return parsed
}

function parseQuantity(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null
  const cleaned = raw.replace(/[,\s]/g, '')
  const parsed = parseFloat(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function parseStatementDate(raw: string | undefined): Date | null {
  if (!raw || !raw.trim()) return null
  const match = raw.trim().match(/^(\d{1,2}\/\d{1,2}\/\d{4})/)
  if (!match) return null

  const parsed = parseDate(match[1], 'M/d/yyyy', new Date())
  if (Number.isNaN(parsed.getTime())) return null

  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  )
}

function inferOptionMultiplier(args: {
  action: string
  quantity: number | null
  price: number | null
  fees: number
  amount: number | null
}): number | null {
  const { action, quantity, price, fees, amount } = args
  if (quantity == null || quantity === 0 || price == null || price === 0 || amount == null) {
    return null
  }

  const grossCash =
    action.startsWith('Buy')
      ? Math.abs(amount) - fees
      : amount + fees

  if (grossCash <= 0) return null

  const inferred = grossCash / (Math.abs(quantity) * price)
  const rounded = Math.round(inferred)

  return Math.abs(inferred - rounded) <= 0.05 ? rounded : null
}

function parseOptionContract(
  symbol: string,
  quantity: number | null,
  price: number | null,
  fees: number,
  amount: number | null,
  action: string,
): OptionContractDetails | null {
  const match = symbol.match(OPTION_SYMBOL_RE)
  if (!match) return null

  const [, underlying, expiration, strike, optionType] = match

  const multiplier = inferOptionMultiplier({ action, quantity, price, fees, amount }) ?? 100
  const quantityContracts = quantity == null ? null : Math.abs(quantity)

  return {
    underlying: underlying.trim(),
    expiration,
    strike: Number(strike),
    optionType: optionType === 'C' ? 'CALL' : 'PUT',
    quantityContracts,
    multiplier,
    underlyingEquivalentQty:
      quantityContracts == null ? null : quantityContracts * multiplier,
  }
}

function classifyRow(row: {
  action: string
  symbol: string
  description: string
  optionContract: OptionContractDetails | null
}): {
  instrumentType: StatementInstrumentType
  actionCategory: StatementActionCategory
  isImportTradeRow: boolean
  blocksCanonicalImport: boolean
  notes: string[]
} {
  const { action, symbol, description, optionContract } = row
  const notes: string[] = []
  const isOption = optionContract != null

  if (action === 'Buy' && !isOption) {
    return {
      instrumentType: 'EQUITY',
      actionCategory: 'EQUITY_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: false,
      notes,
    }
  }

  if (action === 'Sell' && !isOption) {
    return {
      instrumentType: 'EQUITY',
      actionCategory: 'EQUITY_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: false,
      notes,
    }
  }

  if (action === 'Sell Short') {
    return {
      instrumentType: 'EQUITY',
      actionCategory: 'EQUITY_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: false,
      notes,
    }
  }

  if (action === 'Buy to Cover') {
    notes.push('Current canonical parser does not handle explicit "Buy to Cover" rows yet.')
    return {
      instrumentType: 'EQUITY',
      actionCategory: 'EQUITY_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: true,
      notes,
    }
  }

  if (
    action === 'Buy to Open' ||
    action === 'Sell to Close' ||
    action === 'Sell to Open' ||
    action === 'Buy to Close'
  ) {
    notes.push('Option contract row detected. Quantity is contracts, not shares.')
    return {
      instrumentType: 'OPTION',
      actionCategory: 'OPTION_TRADE',
      isImportTradeRow: true,
      blocksCanonicalImport: true,
      notes,
    }
  }

  if (action === 'Expired') {
    notes.push('Expired option rows close positions without a sell transaction.')
    return {
      instrumentType: isOption ? 'OPTION' : 'UNKNOWN',
      actionCategory: 'OPTION_LIFECYCLE',
      isImportTradeRow: false,
      blocksCanonicalImport: true,
      notes,
    }
  }

  if (action === 'Journaled Shares') {
    if (!symbol) {
      if (description.toUpperCase().includes('MARK TO THE MARKET')) {
        notes.push('Journaled cash mark-to-market row detected; does not directly move a symbol position.')
      }
      if (description.toUpperCase().includes('CASH MOVEMENT')) {
        notes.push('Journaled cash movement row detected; treat as cash transfer, not a symbol position change.')
      }
      return {
        instrumentType: 'CASH',
        actionCategory: 'CASH_TRANSFER',
        isImportTradeRow: false,
        blocksCanonicalImport: false,
        notes,
      }
    }

    notes.push('Journaled shares can move stock or option positions without a trade.')
    if (description.toUpperCase().includes('OPTION')) {
      notes.push('Description references options; treat as position-affecting until modeled explicitly.')
    }
    return {
      instrumentType: isOption ? 'OPTION' : 'EQUITY',
      actionCategory: 'POSITION_TRANSFER',
      isImportTradeRow: false,
      blocksCanonicalImport: true,
      notes,
    }
  }

  if (action === 'Stock Merger') {
    notes.push('Corporate action can change quantities/cost basis outside normal trade flow.')
    return {
      instrumentType: 'CORPORATE_ACTION',
      actionCategory: 'CORPORATE_ACTION',
      isImportTradeRow: false,
      blocksCanonicalImport: true,
      notes,
    }
  }

  if (action === 'Service Fee') {
    return {
      instrumentType: 'CASH',
      actionCategory: 'FEE',
      isImportTradeRow: false,
      blocksCanonicalImport: false,
      notes,
    }
  }

  if (INCOME_ACTIONS.has(action)) {
    return {
      instrumentType: 'CASH',
      actionCategory: 'INCOME',
      isImportTradeRow: false,
      blocksCanonicalImport: false,
      notes,
    }
  }

  if (CASH_TRANSFER_ACTIONS.has(action)) {
    return {
      instrumentType: symbol ? 'UNKNOWN' : 'CASH',
      actionCategory: 'CASH_TRANSFER',
      isImportTradeRow: false,
      blocksCanonicalImport: false,
      notes,
    }
  }

  notes.push(`Unknown broker action "${action}" requires classification before import.`)
  return {
    instrumentType: isOption ? 'OPTION' : symbol ? 'UNKNOWN' : 'CASH',
    actionCategory: 'UNKNOWN',
    isImportTradeRow: false,
    blocksCanonicalImport: true,
    notes,
  }
}

export function analyzeSchwabStatement(rawContent: string): StatementDryRun {
  const assumptions: string[] = [
    'Dry-run analysis preserves broker Action values exactly before canonical trade mapping.',
    'Option rows are interpreted in contracts, not underlying shares.',
    'Standard equity-option multiplier defaults to 100 when the statement cash flow matches that convention.',
    'Rows that can change positions outside ordinary buys/sells are treated as canonical-import blockers until modeled explicitly.',
  ]

  const content = rawContent.replace(/^\uFEFF/, '')
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  })

  const orderedData = [...data]
  if (orderedData.length > 1) {
    const firstDate = parseStatementDate(orderedData[0]?.Date)?.getTime() ?? null
    const lastDate =
      parseStatementDate(orderedData[orderedData.length - 1]?.Date)?.getTime() ?? null
    if (firstDate != null && lastDate != null && firstDate > lastDate) {
      orderedData.reverse()
      assumptions.push(
        'Statement is newest-to-oldest (Schwab format) — reversed for chronological sequencing.',
      )
    }
  }

  const rows: AnalyzedStatementRow[] = []

  for (let rowIndex = 0; rowIndex < orderedData.length; rowIndex += 1) {
    const raw = orderedData[rowIndex]
    const action = (raw.Action ?? '').trim()
    const symbol = (raw.Symbol ?? '').trim().toUpperCase()
    const description = (raw.Description ?? '').trim()
    const quantity = parseQuantity(raw.Quantity)
    const price = parseMoney(raw.Price)
    const fees = parseMoney(raw['Fees & Comm']) ?? 0
    const amount = parseMoney(raw.Amount)
    const optionContract = parseOptionContract(
      symbol,
      quantity,
      price,
      fees,
      amount,
      action,
    )
    const classification = classifyRow({
      action,
      symbol,
      description,
      optionContract,
    })

    rows.push({
      rowIndex,
      raw,
      date: parseStatementDate(raw.Date),
      action,
      symbol,
      description,
      quantity,
      price,
      fees,
      amount,
      instrumentType: classification.instrumentType,
      actionCategory: classification.actionCategory,
      optionContract,
      isImportTradeRow: classification.isImportTradeRow,
      blocksCanonicalImport: classification.blocksCanonicalImport,
      notes: classification.notes,
    })
  }

  return buildStatementDryRun(rows, assumptions)
}

/**
 * Aggregates analyzed rows into the dry-run summary. Shared by every statement
 * format parser so blockers, action breakdowns, and counts stay consistent.
 */
export function buildStatementDryRun(
  rows: AnalyzedStatementRow[],
  assumptions: string[],
  options: {
    sourceFormat?: StatementSourceFormat
    coverage?: { from: Date; to: Date } | null
  } = {},
): StatementDryRun {
  const sourceFormat = options.sourceFormat ?? 'SCHWAB_TRANSACTION_HISTORY'
  const actionMap = new Map<string, StatementActionBreakdown>()
  const blockers = new Set<string>()
  const warnings = new Set<string>()
  const symbols = new Set<string>()
  const timestamps: number[] = []

  let importableTradeRows = 0
  let blockedTradeRows = 0
  let nonTradeRows = 0
  let positionAffectingNonTradeRows = 0
  let optionRows = 0
  let skippedRows = 0

  for (const row of rows) {
    if (row.symbol) symbols.add(row.symbol)
    if (row.date) timestamps.push(row.date.getTime())
    else skippedRows += 1

    if (row.optionContract) optionRows += 1

    if (row.isImportTradeRow && !row.blocksCanonicalImport) importableTradeRows += 1
    else if (row.isImportTradeRow && row.blocksCanonicalImport) blockedTradeRows += 1
    else nonTradeRows += 1

    if (!row.isImportTradeRow && row.blocksCanonicalImport) {
      positionAffectingNonTradeRows += 1
    }

    const existing = actionMap.get(row.action) ?? {
      action: row.action || '(blank)',
      count: 0,
      category: row.actionCategory,
      importableCount: 0,
      blockedCount: 0,
      instrumentTypes: [],
    }

    existing.count += 1
    if (row.isImportTradeRow && !row.blocksCanonicalImport) existing.importableCount += 1
    if (row.blocksCanonicalImport) existing.blockedCount += 1
    if (!existing.instrumentTypes.includes(row.instrumentType)) {
      existing.instrumentTypes.push(row.instrumentType)
    }
    actionMap.set(row.action, existing)

    if (row.actionCategory === 'OPTION_TRADE') {
      blockers.add(
        'This statement includes option opening/closing transactions. Canonical import is disabled until option contracts are modeled explicitly.',
      )
    }
    if (row.actionCategory === 'OPTION_LIFECYCLE') {
      blockers.add(
        'This statement includes option lifecycle events such as expiration. Canonical import is disabled until those events are grouped safely.',
      )
    }
    if (row.actionCategory === 'POSITION_TRANSFER') {
      blockers.add(
        'This statement includes position-affecting transfer/journal rows. Canonical import is disabled until non-trade position changes are modeled explicitly.',
      )
    }
    if (row.action === 'Buy to Cover') {
      blockers.add(
        'This statement includes explicit "Buy to Cover" rows. The current canonical parser only infers short closes from description text, so import is disabled until explicit handling is added.',
      )
    }
    for (const note of row.notes) warnings.add(note)
  }

  const actions = [...actionMap.values()].sort((left, right) => right.count - left.count)
  const dateRange =
    timestamps.length > 0
      ? {
          from: new Date(Math.min(...timestamps)),
          to: new Date(Math.max(...timestamps)),
        }
      : null

  return {
    totalRows: rows.length,
    importableTradeRows,
    blockedTradeRows,
    nonTradeRows,
    positionAffectingNonTradeRows,
    optionRows,
    skippedRows,
    symbols: [...symbols].sort(),
    dateRange,
    // Transaction History rows are already UTC-midnight dates, so the row span
    // is the best available coverage when the file states none.
    coverage: options.coverage ?? dateRange,
    warnings: [...warnings],
    blockers: [...blockers],
    assumptions,
    actions,
    rows,
    sourceFormat,
    // importSupported gates the legacy equity-only Execution path, which can
    // only read Schwab Transaction History. Other formats always go through
    // the broker ledger import path.
    importSupported:
      sourceFormat === 'SCHWAB_TRANSACTION_HISTORY' &&
      blockedTradeRows === 0 &&
      positionAffectingNonTradeRows === 0 &&
      importableTradeRows > 0,
  }
}
