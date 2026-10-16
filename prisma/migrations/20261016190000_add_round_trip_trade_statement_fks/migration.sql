-- schema.prisma declares RoundTripTrade -> BrokerStatementImport / BrokerStatementPosition
-- relations (added in 8e7247e) that were never migrated. Guarded so databases
-- where the constraints were already added by hand apply this as a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RoundTripTrade_brokerStatementImportId_fkey'
  ) THEN
    ALTER TABLE "RoundTripTrade" ADD CONSTRAINT "RoundTripTrade_brokerStatementImportId_fkey"
      FOREIGN KEY ("brokerStatementImportId") REFERENCES "BrokerStatementImport"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RoundTripTrade_brokerStatementPositionId_fkey'
  ) THEN
    ALTER TABLE "RoundTripTrade" ADD CONSTRAINT "RoundTripTrade_brokerStatementPositionId_fkey"
      FOREIGN KEY ("brokerStatementPositionId") REFERENCES "BrokerStatementPosition"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
