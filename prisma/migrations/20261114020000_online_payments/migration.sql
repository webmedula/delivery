-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'AWAITING', 'PAID', 'EXPIRED', 'REFUNDED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE_PIX';
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE_CARD';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "cpfCnpj" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "paymentUrl" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "asaasAccountId" TEXT,
ADD COLUMN     "asaasAccountStatus" TEXT,
ADD COLUMN     "asaasApiKeyEnc" TEXT,
ADD COLUMN     "asaasWalletId" TEXT,
ADD COLUMN     "onlineCardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onlinePixEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentId_key" ON "Order"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_asaasAccountId_key" ON "Store"("asaasAccountId");

