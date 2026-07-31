-- AlterTable
ALTER TABLE "ExecutionRecord" ADD COLUMN     "pairedBuyId" TEXT;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_pairedBuyId_fkey" FOREIGN KEY ("pairedBuyId") REFERENCES "ExecutionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
