-- CreateTable
CREATE TABLE "TradeFill" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "posEffect" "PosEffect" NOT NULL,
    "side" "Side" NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "price" DECIMAL(14,4),
    "fees" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "TradeFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeFill_tradeId_seq_idx" ON "TradeFill"("tradeId", "seq");

-- AddForeignKey
ALTER TABLE "TradeFill" ADD CONSTRAINT "TradeFill_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "RoundTripTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

