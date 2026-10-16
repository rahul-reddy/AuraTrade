-- AlterTable
ALTER TABLE "BrokerStatementImport" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "coverageFrom" DATE,
ADD COLUMN     "coverageTo" DATE,
ADD COLUMN     "sourceFormat" TEXT NOT NULL DEFAULT 'SCHWAB_TRANSACTION_HISTORY';

-- Backfill: thinkorswim Account Statements are identifiable by the parser's assumption line.
UPDATE "BrokerStatementImport"
SET "sourceFormat" = 'TOS_ACCOUNT_STATEMENT'
WHERE EXISTS (
  SELECT 1 FROM unnest("assumptions") AS a WHERE a LIKE 'thinkorswim Account Statement%'
);

-- Backfill coverage from the stored first/last row dates. Re-previewing or
-- re-confirming a statement refreshes this with the exact header coverage.
UPDATE "BrokerStatementImport"
SET "coverageFrom" = "dateFrom"::date,
    "coverageTo" = "dateTo"::date;

-- Backfill: a statement feeds the account-level ledger only if it already owns
-- ledger trades. Statements imported through the legacy Execution path stay
-- unconfirmed: their trades are Execution-backed, and confirming them here would
-- count the same fills twice.
UPDATE "BrokerStatementImport" AS b
SET "confirmedAt" = b."updatedAt"
WHERE EXISTS (SELECT 1 FROM "RoundTripTrade" t WHERE t."brokerStatementImportId" = b."id");
