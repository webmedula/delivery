-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "billingSubscriptionId" TEXT,
ADD COLUMN     "cpfCnpj" TEXT;

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storeId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_billingSubscriptionId_key" ON "Store"("billingSubscriptionId");

