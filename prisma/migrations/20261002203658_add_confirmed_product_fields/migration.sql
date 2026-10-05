-- AlterTable
ALTER TABLE "ParchaJobRow" ADD COLUMN     "confirmedProductId" TEXT,
ADD COLUMN     "confirmedVariantId" TEXT;

-- AddForeignKey
ALTER TABLE "ParchaJobRow" ADD CONSTRAINT "ParchaJobRow_confirmedProductId_fkey" FOREIGN KEY ("confirmedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParchaJobRow" ADD CONSTRAINT "ParchaJobRow_confirmedVariantId_fkey" FOREIGN KEY ("confirmedVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
