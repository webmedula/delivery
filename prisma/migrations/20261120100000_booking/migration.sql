-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'BOOKING';

-- AlterEnum
ALTER TYPE "FulfillmentType" ADD VALUE 'APPOINTMENT';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'IN_PERSON';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "professionalId" TEXT,
ADD COLUMN     "professionalName" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "bookingCancelHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "bookingClosedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bookingMaxDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "bookingMinMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "bookingStepMinutes" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "workHours" TEXT[] DEFAULT ARRAY['', '09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-19:00', '09:00-19:00', '08:00-14:00']::TEXT[],
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commissionPercent" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "professionalId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Professional_storeId_idx" ON "Professional"("storeId");

-- CreateIndex
CREATE INDEX "TimeBlock_storeId_startsAt_idx" ON "TimeBlock"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "Order_professionalId_scheduledFor_idx" ON "Order"("professionalId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

