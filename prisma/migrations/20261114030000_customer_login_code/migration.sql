-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "loginCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "loginCodeHash" TEXT;
