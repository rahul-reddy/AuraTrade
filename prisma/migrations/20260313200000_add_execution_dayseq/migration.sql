-- AddColumn: daySeq for content-based cross-file deduplication
-- Replaces rowIndex-encoded execTime with an explicit 0-based occurrence counter
-- per (accountId, execTime, symbol, side, qty, price) group on a given day.

ALTER TABLE "Execution" ADD COLUMN "daySeq" INTEGER NOT NULL DEFAULT 0;

-- Drop old unique constraint (execTime encoded rowIndex as milliseconds offset)
DROP INDEX "Execution_accountId_execTime_symbol_side_qty_price_key";

-- Add new unique constraint including daySeq
CREATE UNIQUE INDEX "Execution_accountId_execTime_symbol_side_qty_price_daySeq_key"
  ON "Execution"("accountId", "execTime", "symbol", "side", "qty", "price", "daySeq");
