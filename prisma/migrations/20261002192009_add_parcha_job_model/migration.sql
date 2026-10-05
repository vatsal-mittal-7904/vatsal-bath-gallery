-- CreateEnum
CREATE TYPE "ParchaJobStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ParchaJob" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "ParchaJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),

    CONSTRAINT "ParchaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParchaJob_storageKey_key" ON "ParchaJob"("storageKey");

-- CreateIndex
CREATE INDEX "ParchaJob_uploaderId_idx" ON "ParchaJob"("uploaderId");

-- CreateIndex
CREATE INDEX "ParchaJob_status_idx" ON "ParchaJob"("status");

-- AddForeignKey
ALTER TABLE "ParchaJob" ADD CONSTRAINT "ParchaJob_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
