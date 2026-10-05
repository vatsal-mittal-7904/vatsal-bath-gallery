-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_idempotencyKey_key" ON "Bill"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_idempotencyKey_key" ON "Estimate"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
