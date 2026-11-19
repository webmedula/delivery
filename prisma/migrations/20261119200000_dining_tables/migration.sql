-- AlterEnum
ALTER TYPE "FulfillmentType" ADD VALUE 'TABLE';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'TAB';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billClosedAt" TIMESTAMP(3),
ADD COLUMN     "tableId" TEXT,
ADD COLUMN     "tableLabel" TEXT;

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "callKind" TEXT,
    "calledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_code_key" ON "DiningTable"("code");

-- CreateIndex
CREATE INDEX "DiningTable_storeId_idx" ON "DiningTable"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_storeId_label_key" ON "DiningTable"("storeId", "label");

-- CreateIndex
CREATE INDEX "Order_tableId_billClosedAt_idx" ON "Order"("tableId", "billClosedAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
