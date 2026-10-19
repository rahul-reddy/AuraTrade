-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "entryCriteria" TEXT NOT NULL DEFAULT '',
    "exitCriteria" TEXT NOT NULL DEFAULT '',
    "invalidation" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookJournal" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "isExample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlaybookJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "observation" TEXT NOT NULL DEFAULT '',
    "experiment" TEXT NOT NULL DEFAULT '',
    "successCriteria" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playbook_accountId_archived_idx" ON "Playbook"("accountId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookJournal_journalId_key" ON "PlaybookJournal"("journalId");

-- CreateIndex
CREATE INDEX "PlaybookJournal_playbookId_idx" ON "PlaybookJournal"("playbookId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_accountId_weekStart_key" ON "WeeklyReview"("accountId", "weekStart");

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookJournal" ADD CONSTRAINT "PlaybookJournal_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookJournal" ADD CONSTRAINT "PlaybookJournal_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "TradeJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
