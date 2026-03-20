-- AlterTable
ALTER TABLE "BrokerStatementPosition" ADD COLUMN     "remainingQty" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RoundTripTrade" ADD COLUMN     "remainingQty" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- Backfill broker-ledger remaining quantity from persisted open/close row indices.
UPDATE "BrokerStatementPosition" AS p
SET "remainingQty" = COALESCE(open_totals.qty, 0) - COALESCE(close_totals.qty, 0)
FROM LATERAL (
  SELECT SUM(COALESCE(r."optionQuantityContracts", ABS(r."quantity"))) AS qty
  FROM "BrokerStatementRow" AS r
  WHERE r."statementImportId" = p."statementImportId"
    AND r."rowIndex" = ANY(p."openRows")
) AS open_totals,
LATERAL (
  SELECT SUM(COALESCE(r."optionQuantityContracts", ABS(r."quantity"))) AS qty
  FROM "BrokerStatementRow" AS r
  WHERE r."statementImportId" = p."statementImportId"
    AND r."rowIndex" = ANY(p."closeRows")
) AS close_totals;

-- Sync canonical mixed-import trades from their persisted broker positions.
UPDATE "RoundTripTrade" AS t
SET "remainingQty" = p."remainingQty"
FROM "BrokerStatementPosition" AS p
WHERE t."brokerStatementPositionId" = p."id";

-- Best-effort backfill for legacy execution-backed trades; future rebuilds/imports
-- compute this exactly from the FIFO queue in application code.
UPDATE "RoundTripTrade"
SET "remainingQty" = CASE
  WHEN "brokerStatementPositionId" IS NULL AND "isOpen" = TRUE
    THEN GREATEST("totalQty" - "closedQty", 0)
  ELSE "remainingQty"
END;
