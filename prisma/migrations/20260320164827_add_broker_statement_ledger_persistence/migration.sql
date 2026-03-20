-- CreateTable
CREATE TABLE "BrokerStatementPosition" (
    "id" TEXT NOT NULL,
    "statementImportId" TEXT NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "instrumentType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "totalQty" DECIMAL(14,4) NOT NULL,
    "closedQty" DECIMAL(14,4) NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "underlyingEquivalentQty" DECIMAL(14,4) NOT NULL,
    "entryPrice" DECIMAL(14,4) NOT NULL,
    "exitPrice" DECIMAL(14,4),
    "grossPnl" DECIMAL(16,4),
    "totalFees" DECIMAL(14,4) NOT NULL,
    "netPnl" DECIMAL(16,4),
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openRows" INTEGER[],
    "closeRows" INTEGER[],
    "openingActions" TEXT[],
    "closingActions" TEXT[],
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "closeKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerStatementPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerStatementWarning" (
    "id" TEXT NOT NULL,
    "statementImportId" TEXT NOT NULL,
    "rowIndex" INTEGER,
    "instrumentKey" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerStatementWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrokerStatementPosition_statementImportId_instrumentKey_idx" ON "BrokerStatementPosition"("statementImportId", "instrumentKey");

-- CreateIndex
CREATE INDEX "BrokerStatementPosition_statementImportId_isOpen_idx" ON "BrokerStatementPosition"("statementImportId", "isOpen");

-- CreateIndex
CREATE INDEX "BrokerStatementWarning_statementImportId_rowIndex_idx" ON "BrokerStatementWarning"("statementImportId", "rowIndex");

-- AddForeignKey
ALTER TABLE "BrokerStatementPosition" ADD CONSTRAINT "BrokerStatementPosition_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BrokerStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerStatementWarning" ADD CONSTRAINT "BrokerStatementWarning_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BrokerStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
