-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER');

-- CreateEnum
CREATE TYPE "PosEffect" AS ENUM ('OPEN', 'CLOSE', 'AUTO');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketRegime" AS ENUM ('TRENDING_UP', 'TRENDING_DOWN', 'CHOPPY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'Schwab/TOS',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startingBalance" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "newRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "uploadId" TEXT,
    "tradeId" TEXT,
    "execTime" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "netPrice" DECIMAL(12,4) NOT NULL,
    "commission" DECIMAL(10,4) NOT NULL,
    "posEffect" "PosEffect" NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'STOCK',
    "spread" TEXT,
    "orderType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundTripTrade" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "entryPrice" DECIMAL(12,4) NOT NULL,
    "exitPrice" DECIMAL(12,4),
    "totalQty" DECIMAL(12,4) NOT NULL,
    "closedQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "grossPnl" DECIMAL(14,4),
    "totalFees" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "netPnl" DECIMAL(14,4),
    "initialRisk" DECIMAL(12,4),
    "riskSource" TEXT,
    "rMultiple" DECIMAL(8,4),
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "tags" TEXT[],
    "notes" TEXT,
    "notesUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundTripTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeContext" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "sma20" DECIMAL(12,4) NOT NULL,
    "sma50" DECIMAL(12,4) NOT NULL,
    "sma200" DECIMAL(12,4) NOT NULL,
    "ema20" DECIMAL(12,4) NOT NULL,
    "atr14" DECIMAL(12,4) NOT NULL,
    "rsi14" DECIMAL(12,4) NOT NULL,
    "adx14" DECIMAL(12,4) NOT NULL,
    "bbUpper" DECIMAL(12,4) NOT NULL,
    "bbLower" DECIMAL(12,4) NOT NULL,
    "highN52w" DECIMAL(12,4) NOT NULL,
    "lowN52w" DECIMAL(12,4) NOT NULL,
    "prevClose" DECIMAL(12,4) NOT NULL,
    "gapPercent" DECIMAL(8,4) NOT NULL,
    "nearestEarningsDate" TIMESTAMP(3),
    "daysToEarnings" INTEGER,
    "marketRegime" "MarketRegime",
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeClassification" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "setup" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "secondarySetup" TEXT,
    "scoreBreakdown" JSONB NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dailyPnl" DECIMAL(14,4) NOT NULL,
    "cumulativePnl" DECIMAL(14,4) NOT NULL,
    "peakEquity" DECIMAL(14,4) NOT NULL,
    "drawdown" DECIMAL(14,4) NOT NULL,
    "maxDrawdown" DECIMAL(14,4) NOT NULL,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "grossPnl" DECIMAL(14,4) NOT NULL,
    "totalFees" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "DailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataCache" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeframe" TEXT NOT NULL,
    "open" DECIMAL(12,4) NOT NULL,
    "high" DECIMAL(12,4) NOT NULL,
    "low" DECIMAL(12,4) NOT NULL,
    "close" DECIMAL(12,4) NOT NULL,
    "volume" BIGINT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDataCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "TradingAccount_userId_idx" ON "TradingAccount"("userId");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "Upload"("userId");

-- CreateIndex
CREATE INDEX "Upload_accountId_idx" ON "Upload"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_accountId_fileHash_key" ON "Upload"("accountId", "fileHash");

-- CreateIndex
CREATE INDEX "Execution_accountId_symbol_idx" ON "Execution"("accountId", "symbol");

-- CreateIndex
CREATE INDEX "Execution_accountId_execTime_idx" ON "Execution"("accountId", "execTime");

-- CreateIndex
CREATE INDEX "Execution_tradeId_idx" ON "Execution"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_accountId_execTime_symbol_side_qty_price_key" ON "Execution"("accountId", "execTime", "symbol", "side", "qty", "price");

-- CreateIndex
CREATE INDEX "RoundTripTrade_accountId_symbol_idx" ON "RoundTripTrade"("accountId", "symbol");

-- CreateIndex
CREATE INDEX "RoundTripTrade_accountId_entryTime_idx" ON "RoundTripTrade"("accountId", "entryTime");

-- CreateIndex
CREATE INDEX "RoundTripTrade_accountId_isOpen_idx" ON "RoundTripTrade"("accountId", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "TradeContext_tradeId_key" ON "TradeContext"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeClassification_tradeId_key" ON "TradeClassification"("tradeId");

-- CreateIndex
CREATE INDEX "DailySnapshot_accountId_date_idx" ON "DailySnapshot"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailySnapshot_accountId_date_key" ON "DailySnapshot"("accountId", "date");

-- CreateIndex
CREATE INDEX "MarketDataCache_symbol_timeframe_date_idx" ON "MarketDataCache"("symbol", "timeframe", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketDataCache_symbol_date_timeframe_key" ON "MarketDataCache"("symbol", "date", "timeframe");

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "RoundTripTrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTripTrade" ADD CONSTRAINT "RoundTripTrade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeContext" ADD CONSTRAINT "TradeContext_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "RoundTripTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeClassification" ADD CONSTRAINT "TradeClassification_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "RoundTripTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySnapshot" ADD CONSTRAINT "DailySnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
