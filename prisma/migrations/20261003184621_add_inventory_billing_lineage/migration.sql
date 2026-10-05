-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "InventoryLocation" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "billId" TEXT;

-- CreateIndex
CREATE INDEX "Bill_locationId_idx" ON "Bill"("locationId");

-- CreateIndex
CREATE INDEX "StockMovement_billId_idx" ON "StockMovement"("billId");

-- CreateIndex (Partial unique index for default location)
CREATE UNIQUE INDEX "InventoryLocation_isDefault_key" ON "InventoryLocation"("isDefault") WHERE "isDefault" = true;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
