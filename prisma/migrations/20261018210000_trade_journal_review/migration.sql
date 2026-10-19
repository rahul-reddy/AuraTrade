-- AlterTable
ALTER TABLE "RoundTripTrade" ADD COLUMN     "journalId" TEXT;

-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "entryTradingDate" DATE NOT NULL,
    "thesis" TEXT NOT NULL DEFAULT '',
    "setup" TEXT NOT NULL DEFAULT '',
    "plannedStop" DECIMAL(12,4),
    "mistakes" TEXT[],
    "lesson" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "planAdherence" TEXT NOT NULL DEFAULT 'UNASSESSED',
    "reviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAttachment" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReview" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tradingDate" DATE NOT NULL,
    "whatWorked" TEXT NOT NULL DEFAULT '',
    "toImprove" TEXT NOT NULL DEFAULT '',
    "nextFocus" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeJournal_accountId_entryTradingDate_idx" ON "TradeJournal"("accountId", "entryTradingDate");

-- CreateIndex
CREATE INDEX "JournalAttachment_journalId_idx" ON "JournalAttachment"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReview_accountId_tradingDate_key" ON "DailyReview"("accountId", "tradingDate");

-- CreateIndex
CREATE UNIQUE INDEX "RoundTripTrade_journalId_key" ON "RoundTripTrade"("journalId");

-- AddForeignKey
ALTER TABLE "RoundTripTrade" ADD CONSTRAINT "RoundTripTrade_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "TradeJournal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournal" ADD CONSTRAINT "TradeJournal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "TradeJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReview" ADD CONSTRAINT "DailyReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
