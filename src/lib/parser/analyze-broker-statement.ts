import {
  analyzeSchwabStatement,
  type StatementDryRun,
} from '@/lib/parser/schwab-statement-analyzer'
import {
  analyzeTosAccountStatement,
  isTosAccountStatement,
  type TosAccountStatementOptions,
} from '@/lib/parser/tos-account-statement-parser'

/** Detects the broker export format and runs the matching dry-run analyzer. */
export function analyzeBrokerStatement(
  rawContent: string,
  options: TosAccountStatementOptions = {},
): StatementDryRun {
  if (isTosAccountStatement(rawContent)) {
    return analyzeTosAccountStatement(rawContent, options)
  }
  return analyzeSchwabStatement(rawContent)
}
