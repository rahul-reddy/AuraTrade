CREATE TABLE "SchwabConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT,
  "tokens" TEXT,
  "accounts" TEXT,
  "binding" TEXT,
  "oauthState" TEXT,
  "oauthExpiresAt" TIMESTAMP(3),
  "refreshExpiresAt" TIMESTAMP(3),
  "preview" TEXT,
  "previewHash" TEXT,
  "autoSync" BOOLEAN NOT NULL DEFAULT false,
  "lastAttemptAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "message" TEXT,
  CONSTRAINT "SchwabConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchwabConnection_userId_key" ON "SchwabConnection"("userId");
CREATE UNIQUE INDEX "SchwabConnection_accountId_key" ON "SchwabConnection"("accountId");
ALTER TABLE "SchwabConnection" ADD CONSTRAINT "SchwabConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchwabConnection" ADD CONSTRAINT "SchwabConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
