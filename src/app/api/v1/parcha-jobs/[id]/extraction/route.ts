/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export type TestHook = (stage: string) => Promise<void>;
let activeTestHook: TestHook | null = null;

export function __setTestHook(hook: TestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activeTestHook = hook;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('parcha:read');
    
    const job = await prisma.parchaJob.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ rows: job.rows, rawOcrText: job.rawOcrText });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}

const updateExtractionSchema = z.object({
  rows: z.array(z.object({
    id: z.string(),
    revisedProductName: z.string().nullable().optional(),
    revisedNormalizedProductName: z.string().nullable().optional(),
    revisedBrand: z.string().nullable().optional(),
    revisedSize: z.string().nullable().optional(),
    revisedQuantity: z.string().nullable().optional(),
    revisedUnit: z.string().nullable().optional(),
    revisedDescription: z.string().nullable().optional(),
    confirmedProductId: z.string().nullable().optional(),
    confirmedVariantId: z.string().nullable().optional(),
    version: z.number(),
  }))
});

export function isRetryableDbError(error: any): boolean {
  if (!error) return false;
  // Direct PostgreSQL error codes: 40P01 (deadlock_detected), 40001 (serialization_failure)
  if (error.code === '40P01' || error.code === '40001') {
    return true;
  }
  // Prisma interactive transaction write conflict or deadlock
  if (error.code === 'P2034') {
    return true;
  }
  // Prisma raw query failure: verify the underlying database error code confirms a retryable conflict
  if (error.code === 'P2010') {
    const code = error.meta?.code;
    if (code === '40P01' || code === '40001') {
      return true;
    }
  }
  return false;
}

const MAX_TRANSACTION_RETRIES = 3;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('parcha:upload');
    
    // Initial fetch to check existence and ownership before beginning transaction work
    const job = await prisma.parchaJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parsed = updateExtractionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    // Collect and sort distinct product IDs (ascending order) to guarantee strict global lock ordering
    const distinctProductIds = Array.from(
      new Set(parsed.data.rows.map(r => r.confirmedProductId).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b));

    // Collect and sort distinct variant IDs (ascending order) to guarantee strict global lock ordering
    const distinctVariantIds = Array.from(
      new Set(parsed.data.rows.map(r => r.confirmedVariantId).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b));

    // Pre-validation: variant without product is invalid
    for (const row of parsed.data.rows) {
      if (row.confirmedVariantId && !row.confirmedProductId) {
        return NextResponse.json({ error: 'Variant is invalid or inactive' }, { status: 400 });
      }
    }

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          // --- Lock Hierarchy Level 1: ParchaJob ---
          // Atomically acquire row lock and verify status is REVIEW_REQUIRED without mutating updatedAt
          const jobLock = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "ParchaJob" 
            WHERE id = ${id} AND status = CAST('REVIEW_REQUIRED' AS "ParchaJobStatus") 
            FOR UPDATE
          `;
          if (!Array.isArray(jobLock) || jobLock.length === 0) {
            throw new Error('STATUS_CONFLICT');
          }

          if (process.env.NODE_ENV === 'test' && activeTestHook) {
            await activeTestHook('after-job-lock');
          }

          // --- Lock Hierarchy Level 2: Product ---
          // Acquire FOR SHARE locks on products in strictly ascending ID order
          const productMap = new Map<string, { id: string; isActive: boolean }>();
          for (const pid of distinctProductIds) {
            const pRows = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
              SELECT id, "isActive" FROM "Product" WHERE id = ${pid} FOR SHARE
            `;
            const pRow = Array.isArray(pRows) && pRows.length > 0 ? pRows[0] : null;
            if (!pRow || !pRow.isActive) {
              throw new Error('PRODUCT_INVALID');
            }
            productMap.set(pid, pRow);
          }

          // --- Lock Hierarchy Level 3: ProductVariant ---
          // Acquire FOR SHARE locks on variants in strictly ascending ID order
          const variantMap = new Map<string, { id: string; productId: string; isActive: boolean }>();
          for (const vid of distinctVariantIds) {
            const vRows = await tx.$queryRaw<{ id: string; productId: string; isActive: boolean }[]>`
              SELECT id, "productId", "isActive" FROM "ProductVariant" WHERE id = ${vid} FOR SHARE
            `;
            const vRow = Array.isArray(vRows) && vRows.length > 0 ? vRows[0] : null;
            if (!vRow || !vRow.isActive) {
              throw new Error('VARIANT_INVALID');
            }
            variantMap.set(vid, vRow);
          }

          // --- Referential & Relationship Integrity Checks ---
          for (const row of parsed.data.rows) {
            if (row.confirmedProductId) {
              const product = productMap.get(row.confirmedProductId);
              if (!product || !product.isActive) {
                throw new Error('PRODUCT_INVALID');
              }
              if (row.confirmedVariantId) {
                const variant = variantMap.get(row.confirmedVariantId);
                if (!variant || !variant.isActive) {
                  throw new Error('VARIANT_INVALID');
                }
                if (variant.productId !== row.confirmedProductId) {
                  throw new Error('VARIANT_MISMATCH');
                }
              }
            }
          }

          if (process.env.NODE_ENV === 'test' && activeTestHook) {
            await activeTestHook('after-catalogue-locks');
          }

          // --- Lock Hierarchy Level 4: ParchaJobRow Updates ---
          // Sort row mutations in strictly ascending ID order to avoid intra-table lock inversions
          const sortedRows = [...parsed.data.rows].sort((a, b) => a.id.localeCompare(b.id));
          for (const row of sortedRows) {
            const updateResult = await tx.parchaJobRow.updateMany({
              where: { id: row.id, jobId: id, version: row.version },
              data: {
                confirmedProductId: row.confirmedProductId,
                confirmedVariantId: row.confirmedVariantId,
                revisedProductName: row.revisedProductName,
                revisedNormalizedProductName: row.revisedNormalizedProductName,
                revisedBrand: row.revisedBrand,
                revisedSize: row.revisedSize,
                revisedQuantity: row.revisedQuantity,
                revisedUnit: row.revisedUnit,
                revisedDescription: row.revisedDescription,
                version: { increment: 1 }
              }
            });

            if (updateResult.count === 0) {
              throw new Error('VERSION_CONFLICT');
            }
          }
        });

        // Successful commit
        return NextResponse.json({ message: 'Saved successfully' });
      } catch (error: any) {
        lastError = error;

        // Non-retryable domain errors must terminate immediately without retry
        if (error.message === 'STATUS_CONFLICT') {
          return NextResponse.json({ error: 'Job is not in review phase' }, { status: 409 });
        }
        if (error.message === 'VERSION_CONFLICT') {
          return NextResponse.json({ error: 'Row was modified by another user. Please refresh.' }, { status: 409 });
        }
        if (error.message === 'VARIANT_INVALID') {
          return NextResponse.json({ error: 'Variant is invalid or inactive' }, { status: 400 });
        }
        if (error.message === 'VARIANT_MISMATCH') {
          return NextResponse.json({ error: 'Variant does not belong to the specified product' }, { status: 400 });
        }
        if (error.message === 'PRODUCT_INVALID') {
          return NextResponse.json({ error: 'Product is invalid or inactive' }, { status: 400 });
        }

        // Check if database error is retryable (deadlock / serialization failure)
        if (isRetryableDbError(error) && attempt < MAX_TRANSACTION_RETRIES) {
          logger.warn({ attempt, jobId: id, error: error.message }, 'Retryable database transaction error encountered, retrying...');
          const backoffMs = Math.min(50 * Math.pow(2, attempt - 1) + Math.random() * 20, 500);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        // Non-retryable error or retries exhausted: break out
        break;
      }
    }

    if (isRetryableDbError(lastError)) {
      logger.error({ jobId: id, retries: MAX_TRANSACTION_RETRIES, error: lastError?.message }, 'Transaction conflict retries exhausted');
      return NextResponse.json({ error: 'Database transaction conflict. Please retry.' }, { status: 409 });
    }

    logger.error({ jobId: id, error: lastError?.message }, 'Unhandled error in extraction PATCH');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } catch (error: any) {
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    logger.error({ error: error?.message }, 'Unexpected exception in extraction route');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
