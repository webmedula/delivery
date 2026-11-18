-- AlterEnum
ALTER TYPE "FulfillmentType" ADD VALUE 'SHIPPING';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCep" TEXT,
ADD COLUMN     "shippingDaysMax" INTEGER,
ADD COLUMN     "shippingDaysMin" INTEGER,
ADD COLUMN     "shippingMethodId" TEXT,
ADD COLUMN     "shippingMethodName" TEXT,
ADD COLUMN     "shippingUf" TEXT,
ADD COLUMN     "trackingCode" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "acceptsShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingFreeAboveCents" INTEGER,
ADD COLUMN     "shippingOriginUf" TEXT;

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sameStateCents" INTEGER,
    "southeastCents" INTEGER,
    "southCents" INTEGER,
    "midwestCents" INTEGER,
    "northeastCents" INTEGER,
    "northCents" INTEGER,
    "daysMin" INTEGER,
    "daysMax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredImage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingMethod_storeId_idx" ON "ShippingMethod"("storeId");

-- CreateIndex
CREATE INDEX "StoredImage_storeId_idx" ON "StoredImage"("storeId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

