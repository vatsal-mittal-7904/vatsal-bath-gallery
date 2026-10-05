-- AlterTable
ALTER TABLE "ParchaJob" ADD COLUMN     "ocrModel" TEXT,
ADD COLUMN     "ocrProvider" TEXT,
ADD COLUMN     "processingAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rawOcrText" TEXT;

-- CreateTable
CREATE TABLE "ParchaJobRow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ocrOriginalText" TEXT NOT NULL,
    "ocrProductName" TEXT,
    "ocrBrand" TEXT,
    "ocrSize" TEXT,
    "ocrQuantity" TEXT,
    "ocrUnit" TEXT,
    "ocrDescription" TEXT,
    "ocrConfidence" TEXT,
    "ocrNotes" TEXT,
    "revisedProductName" TEXT,
    "revisedBrand" TEXT,
    "revisedSize" TEXT,
    "revisedQuantity" TEXT,
    "revisedUnit" TEXT,
    "revisedDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParchaJobRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParchaJobRow_jobId_idx" ON "ParchaJobRow"("jobId");

-- AddForeignKey
ALTER TABLE "ParchaJobRow" ADD CONSTRAINT "ParchaJobRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ParchaJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
