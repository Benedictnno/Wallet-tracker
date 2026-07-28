-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "label" TEXT,
    "riskScore" DOUBLE PRECISION,
    "smartScore" DOUBLE PRECISION,
    "isSuspectedBot" BOOLEAN NOT NULL DEFAULT false,
    "botType" TEXT,
    "botConfidence" DOUBLE PRECISION,
    "integrityFlags" TEXT,
    "integrityPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketCap" DOUBLE PRECISION,
    "liquidity" DOUBLE PRECISION,
    "priceUsd" DOUBLE PRECISION,
    "fdv" DOUBLE PRECISION,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "spamReason" TEXT,
    "launchDate" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "metadataUpdatedAt" TIMESTAMP(3),
    "chain" TEXT NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "signature" TEXT,
    "walletId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "transactionType" TEXT,
    "source" TEXT,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "counterAssetAddress" TEXT,
    "counterAssetSymbol" TEXT,
    "counterAmount" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "entrySignature" TEXT,
    "exitSignature" TEXT,
    "entrySource" TEXT,
    "exitSource" TEXT,
    "tokenFirstSeenAt" TIMESTAMP(3),
    "tokenAgeSecondsAtEntry" INTEGER,
    "entryCounterAssetAddress" TEXT,
    "entryCounterAssetSymbol" TEXT,
    "entryCounterAmount" DOUBLE PRECISION,
    "exitCounterAssetAddress" TEXT,
    "exitCounterAssetSymbol" TEXT,
    "exitCounterAmount" DOUBLE PRECISION,
    "entryMarketCapEstimate" DOUBLE PRECISION,
    "entryLiquidityEstimate" DOUBLE PRECISION,
    "delayWindowSeconds" INTEGER,
    "delayPriceChangePct" DOUBLE PRECISION,
    "profitLoss" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "realizedPnL" DOUBLE PRECISION,
    "unrealizedPnL" DOUBLE PRECISION,
    "remainingAmount" DOUBLE PRECISION,
    "holdingTime" INTEGER,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletScore" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "profitabilityScore" DOUBLE PRECISION NOT NULL,
    "consistencyScore" DOUBLE PRECISION NOT NULL,
    "entryTimingScore" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "tradeQualityScore" DOUBLE PRECISION NOT NULL,
    "copyabilityScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalROI" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageTradeROI" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCountConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyConsistency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "earlyEntryPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstBuyerPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageHoldingTimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageTradesPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "largestPositionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageLossPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskAdjustedReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delaySensitivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyTradeSettings" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxDailyLoss" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "defaultTradeSize" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "slippageBps" INTEGER NOT NULL DEFAULT 300,
    "takeProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "stopLossPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyTradeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRecord" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "targetTradeId" TEXT,
    "tokenId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountSol" DOUBLE PRECISION NOT NULL,
    "amountToken" DOUBLE PRECISION,
    "executionPrice" DOUBLE PRECISION,
    "slippageTaken" DOUBLE PRECISION,
    "errorReason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "discordWebhookUrl" TEXT,
    "liveTradeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "globalMaxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "globalDailyLossSol" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_chain_key" ON "Wallet"("address", "chain");

-- CreateIndex
CREATE UNIQUE INDEX "Token_address_chain_key" ON "Token"("address", "chain");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletScore_walletId_key" ON "WalletScore"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "CopyTradeSettings_walletId_key" ON "CopyTradeSettings"("walletId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletScore" ADD CONSTRAINT "WalletScore_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTradeSettings" ADD CONSTRAINT "CopyTradeSettings_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
