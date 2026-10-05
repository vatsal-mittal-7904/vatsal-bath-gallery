-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "parchaJobId" TEXT;

-- AlterTable
ALTER TABLE "EstimateLine" ADD COLUMN     "parchaRowId" TEXT;

-- CreateIndex
CREATE INDEX "Estimate_parchaJobId_idx" ON "Estimate"("parchaJobId");

-- CreateIndex
CREATE INDEX "EstimateLine_parchaRowId_idx" ON "EstimateLine"("parchaRowId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_parchaJobId_fkey" FOREIGN KEY ("parchaJobId") REFERENCES "ParchaJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_parchaRowId_fkey" FOREIGN KEY ("parchaRowId") REFERENCES "ParchaJobRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
