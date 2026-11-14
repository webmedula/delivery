-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryZoneId" TEXT,
ADD COLUMN     "deliveryZoneName" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "etaMinutesMax" INTEGER,
ADD COLUMN     "etaMinutesMin" INTEGER;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "deliveryMinutesMax" INTEGER,
ADD COLUMN     "deliveryMinutesMin" INTEGER,
ADD COLUMN     "pickupMinutesMax" INTEGER,
ADD COLUMN     "pickupMinutesMin" INTEGER;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_storeId_name_key" ON "DeliveryZone"("storeId", "name");

-- CreateIndex
CREATE INDEX "Order_storeId_status_idx" ON "Order"("storeId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Pedidos antigos: usa a última atualização como data de conclusão/cancelamento.
UPDATE "Order" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED';
UPDATE "Order" SET "canceledAt" = "updatedAt" WHERE "status" = 'CANCELED';
