-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "label" TEXT,
    "riskScore" REAL,
    "smartScore" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketCap" REAL,
    "liquidity" REAL,
    "chain" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "price" REAL NOT NULL,
    "timestamp" DATETIME NOT NULL,
    CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "exitPrice" REAL,
    "entryTime" DATETIME NOT NULL,
    "exitTime" DATETIME,
    "profitLoss" REAL,
    "roi" REAL,
    "holdingTime" INTEGER,
    CONSTRAINT "Trade_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "profitabilityScore" REAL NOT NULL,
    "consistencyScore" REAL NOT NULL,
    "entryTimingScore" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "tradeQualityScore" REAL NOT NULL,
    "copyabilityScore" REAL NOT NULL,
    "totalScore" REAL NOT NULL,
    "classification" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletScore_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WalletScore_walletId_key" ON "WalletScore"("walletId");
