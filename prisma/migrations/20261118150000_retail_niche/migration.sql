-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('FOOD', 'RETAIL');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "stockReserved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "compareAtCents" INTEGER,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stock" INTEGER;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'FOOD',
ADD COLUMN     "whatsappCheckout" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "stock" INTEGER,
    "priceCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_idx" ON "ProductVariant"("storeId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

