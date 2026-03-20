-- CreateTable
CREATE TABLE "BrokerStatementImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importableTradeRows" INTEGER NOT NULL DEFAULT 0,
    "blockedTradeRows" INTEGER NOT NULL DEFAULT 0,
    "nonTradeRows" INTEGER NOT NULL DEFAULT 0,
    "positionAffectingNonTradeRows" INTEGER NOT NULL DEFAULT 0,
    "optionRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "importSupported" BOOLEAN NOT NULL DEFAULT false,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "warnings" TEXT[],
    "blockers" TEXT[],
    "assumptions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerStatementRow" (
    "id" TEXT NOT NULL,
    "statementImportId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rawDate" TEXT,
    "parsedDate" TIMESTAMP(3),
    "action" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantityRaw" TEXT,
    "priceRaw" TEXT,
    "feesRaw" TEXT,
    "amountRaw" TEXT,
    "quantity" DECIMAL(14,4),
    "price" DECIMAL(14,4),
    "fees" DECIMAL(14,4),
    "amount" DECIMAL(16,4),
    "instrumentType" TEXT NOT NULL,
    "actionCategory" TEXT NOT NULL,
    "isImportTradeRow" BOOLEAN NOT NULL DEFAULT false,
    "blocksCanonicalImport" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT[],
    "optionUnderlying" TEXT,
    "optionExpiration" TIMESTAMP(3),
    "optionStrike" DECIMAL(14,4),
    "optionType" TEXT,
    "optionQuantityContracts" DECIMAL(14,4),
    "optionMultiplier" INTEGER,
    "underlyingEquivalentQty" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerStatementRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrokerStatementImport_userId_createdAt_idx" ON "BrokerStatementImport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerStatementImport_accountId_createdAt_idx" ON "BrokerStatementImport"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerStatementImport_accountId_fileHash_key" ON "BrokerStatementImport"("accountId", "fileHash");

-- CreateIndex
CREATE INDEX "BrokerStatementRow_statementImportId_action_idx" ON "BrokerStatementRow"("statementImportId", "action");

-- CreateIndex
CREATE INDEX "BrokerStatementRow_statementImportId_symbol_idx" ON "BrokerStatementRow"("statementImportId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerStatementRow_statementImportId_rowIndex_key" ON "BrokerStatementRow"("statementImportId", "rowIndex");

-- AddForeignKey
ALTER TABLE "BrokerStatementImport" ADD CONSTRAINT "BrokerStatementImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerStatementImport" ADD CONSTRAINT "BrokerStatementImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerStatementRow" ADD CONSTRAINT "BrokerStatementRow_statementImportId_fkey" FOREIGN KEY ("statementImportId") REFERENCES "BrokerStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
