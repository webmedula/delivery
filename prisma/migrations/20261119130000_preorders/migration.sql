-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'PREORDER';

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "preorderMinHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "preorderMaxDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "preorderWeekdays" INTEGER[] DEFAULT ARRAY[2, 3, 4, 5, 6]::INTEGER[],
ADD COLUMN     "preorderTimes" TEXT[] DEFAULT ARRAY['09:00', '11:00', '14:00', '16:00', '18:00']::TEXT[],
ADD COLUMN     "preorderDailyLimit" INTEGER,
ADD COLUMN     "preorderClosedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "depositPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_storeId_scheduledFor_idx" ON "Order"("storeId", "scheduledFor");
