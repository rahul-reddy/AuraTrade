-- AlterTable
ALTER TABLE "RoundTripTrade" ADD COLUMN     "brokerStatementImportId" TEXT,
ADD COLUMN     "brokerStatementPositionId" TEXT,
ADD COLUMN     "closeKind" TEXT,
ADD COLUMN     "contractMultiplier" INTEGER,
ADD COLUMN     "instrumentType" TEXT NOT NULL DEFAULT 'EQUITY',
ADD COLUMN     "optionExpiration" TIMESTAMP(3),
ADD COLUMN     "optionStrike" DECIMAL(14,4),
ADD COLUMN     "optionType" TEXT,
ADD COLUMN     "underlyingEquivalentQty" DECIMAL(14,4),
ADD COLUMN     "underlyingSymbol" TEXT;
