/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { getFile } from '@/lib/storage';
import { GeminiOcrProvider } from '@/features/parcha/providers/gemini-ocr.provider';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('parcha:upload');

    // 1. Validate Job & Atomic Status Claim
    const jobBefore = await prisma.parchaJob.findUnique({ where: { id } });
    if (!jobBefore) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    
    if (user.role !== 'OWNER' && jobBefore.uploaderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for stalled PROCESSING state (older than 5 minutes)
    const isStalled = jobBefore.status === 'PROCESSING' && 
                      jobBefore.processingStartedAt && 
                      (Date.now() - jobBefore.processingStartedAt.getTime()) > 5 * 60 * 1000;

    if (jobBefore.status === 'PROCESSING' && !isStalled) {
      return NextResponse.json({ error: 'Job is already processing' }, { status: 409 });
    }

    if (jobBefore.status !== 'UPLOADED' && jobBefore.status !== 'FAILED' && !isStalled) {
      return NextResponse.json({ error: `Cannot process job in ${jobBefore.status} state` }, { status: 400 });
    }

    if (jobBefore.processingAttempts >= 3) {
      return NextResponse.json({ error: 'Maximum processing attempts reached' }, { status: 400 });
    }

    // Atomic claim with token
    const claimToken = crypto.randomUUID();
    const jobClaim = await prisma.parchaJob.updateMany({
      where: { id, status: jobBefore.status, processingToken: jobBefore.processingToken }, // Optimistic concurrency constraint
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
        processingAttempts: { increment: 1 },
        processingToken: claimToken
      }
    });

    if (jobClaim.count === 0) return NextResponse.json({ error: 'Failed to claim job for processing - claimed by another request' }, { status: 409 });
    
    // We fetch the updated job for the storage key
    const job = await prisma.parchaJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: 'Job not found after claim' }, { status: 404 });

    try {
      const file = await getFile(job.storageKey);
      if (!file) throw new Error('Image file missing from storage');

      const provider = new GeminiOcrProvider();
      const result = await provider.extractFromImage(file.buffer, file.mimeType);

      await prisma.$transaction(async (tx) => {
        // Fetch existing rows to preserve user revisions if this is a retry/reprocess
        const existingRows = await tx.parchaJobRow.findMany({ 
          where: { jobId: id }, 
          orderBy: { sortOrder: 'asc' } 
        });
        
        // Update Job explicitly fenced by the claimToken FIRST (Lock Hierarchy Level 1 -> Level 4)
        const finishClaim = await tx.parchaJob.updateMany({
          where: { id, processingToken: claimToken },
          data: {
            rawOcrText: result.rawText,
            ocrProvider: provider.getProviderName(),
            ocrModel: provider.getModelName(),
            status: 'REVIEW_REQUIRED',
            processingCompletedAt: new Date(),
            errorMessage: null,
            processingToken: null // Clear token on success
          }
        });

        if (finishClaim.count === 0) {
          throw new Error('STALE_CLAIM');
        }

        await tx.parchaJobRow.deleteMany({ where: { jobId: id } });

if (result.items.length > 0) {
          const availableRows = [...existingRows];
          await tx.parchaJobRow.createMany({
            data: result.items.map((item, index) => {
              let existingIndex = availableRows.findIndex(r => r.ocrOriginalText === item.originalText && r.sortOrder === index);
              
              if (existingIndex === -1) {
                existingIndex = availableRows.findIndex(r => r.ocrOriginalText === item.originalText);
              }
              
              if (existingIndex === -1 && result.items.length === existingRows.length) {
                existingIndex = availableRows.findIndex(r => r.sortOrder === index);
              }

              let existing = undefined;
              if (existingIndex !== -1) {
                existing = availableRows.splice(existingIndex, 1)[0];
              }

              return {
                jobId: id,
                sortOrder: index,
                ocrOriginalText: item.originalText,
                ocrProductName: item.productName,
                ocrNormalizedProductName: item.normalizedProductName,
                ocrBrand: item.brand,
                ocrSize: item.size,
                ocrQuantity: item.quantity,
                ocrUnit: item.unit,
                ocrDescription: item.description,
                ocrConfidence: item.confidence,
                ocrNotes: item.notes,

                // Preserve revisions if safely matched, otherwise initialize from OCR
                revisedProductName: existing?.revisedProductName ?? item.productName,
                revisedBrand: existing?.revisedBrand ?? item.brand,
                revisedSize: existing?.revisedSize ?? item.size,
                revisedQuantity: existing?.revisedQuantity ?? item.quantity,
                revisedUnit: existing?.revisedUnit ?? item.unit,
                revisedDescription: existing?.revisedDescription ?? item.description,
              };
            })
          });
        }
      });

      return NextResponse.json({ message: 'Processed successfully', status: 'REVIEW_REQUIRED' });
      
    } catch (procError: any) {
      if (procError.message === 'STALE_CLAIM') {
        console.warn(`[OCR Processing] Request lost claim on job ${id}. Exiting safely without altering state.`);
        return NextResponse.json({ error: 'Superseded by newer request' }, { status: 409 });
      }

      console.error('[OCR Processing Error]', procError);
      // Fenced failure update
      await prisma.parchaJob.updateMany({
        where: { id, processingToken: claimToken },
        data: {
          status: 'FAILED',
          errorMessage: procError.message || 'Processing failed',
          processingToken: null
        }
      });
      return NextResponse.json({ error: procError.message || 'Processing failed' }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}
