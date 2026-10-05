/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { EstimateService } from '@/features/billing/estimate.service';
import { CustomerService } from '@/features/billing/customer.service';
import { isRetryableDbError } from '@/app/api/v1/parcha-jobs/[id]/extraction/route';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '@/lib/errors';

export type EstimateTestHook = (stage: string) => Promise<void>;
let activeEstimateTestHook: EstimateTestHook | null = null;

export function __setEstimateTestHook(hook: EstimateTestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activeEstimateTestHook = hook;
  }
}

const MAX_TRANSACTION_RETRIES = 3;

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Must be a valid positive decimal number string");

const createParchaEstimateSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  issueDate: z.coerce.date(),
  validityDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  lines: z.array(z.object({
    parchaRowId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    variantId: z.string().uuid().optional().nullable(),
    productSnapshot: z.string().min(1),
    variantSnapshot: z.string().optional().nullable(),
    skuSnapshot: z.string().optional().nullable(),
    quantity: decimalString,
    unitOfMeasure: z.string().optional().nullable(),
    unitRate: decimalString,
    discountAmount: decimalString.default('0'),
    taxRate: decimalString.default('0'),
  })).min(1, "At least one line item is required")
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('estimates:create');
    await requirePermission('parcha:read');

    const job = await prisma.parchaJob.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { sortOrder: 'asc' },
          include: {
            confirmedProduct: true,
            confirmedVariant: true,
          }
        }
      }
    });

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (job.status !== 'REVIEW_REQUIRED' && job.status !== 'COMPLETED') {
      return NextResponse.json({
        error: `Cannot create estimate draft from job in ${job.status} state. Job must be reviewed first.`
      }, { status: 400 });
    }

    const eligibleRows: any[] = [];
    const excludedRows: any[] = [];

    for (const row of job.rows) {
      if (!row.confirmedProductId || !row.confirmedProduct) {
        excludedRows.push({
          rowId: row.id,
          sortOrder: row.sortOrder,
          ocrOriginalText: row.ocrOriginalText,
          ocrProductName: row.ocrProductName,
          revisedProductName: row.revisedProductName,
          reason: 'UNCONFIRMED_PRODUCT',
          reasonDescription: 'Candidate product match not confirmed in catalogue'
        });
        continue;
      }

      if (!row.confirmedProduct.isActive) {
        excludedRows.push({
          rowId: row.id,
          sortOrder: row.sortOrder,
          ocrOriginalText: row.ocrOriginalText,
          productName: row.confirmedProduct.name,
          reason: 'INACTIVE_PRODUCT',
          reasonDescription: 'Confirmed product is inactive or archived in catalogue'
        });
        continue;
      }

      if (row.confirmedVariantId && row.confirmedVariant && !row.confirmedVariant.isActive) {
        excludedRows.push({
          rowId: row.id,
          sortOrder: row.sortOrder,
          ocrOriginalText: row.ocrOriginalText,
          productName: row.confirmedProduct.name,
          variantSku: row.confirmedVariant.sku,
          reason: 'INACTIVE_VARIANT',
          reasonDescription: 'Confirmed variant is inactive or archived in catalogue'
        });
        continue;
      }

      const rawQty = row.revisedQuantity ?? row.ocrQuantity;
      const numQty = parseFloat(rawQty || '');
      if (isNaN(numQty) || numQty <= 0) {
        excludedRows.push({
          rowId: row.id,
          sortOrder: row.sortOrder,
          ocrOriginalText: row.ocrOriginalText,
          productName: row.confirmedProduct.name,
          rawQuantity: rawQty,
          reason: 'INVALID_QUANTITY',
          reasonDescription: 'Quantity is missing, zero, or not a positive decimal number'
        });
        continue;
      }

      // Authoritative catalogue price: variant selling price if variant confirmed
      let initialUnitRate = '0';
      if (row.confirmedVariant?.sellingPrice) {
        initialUnitRate = row.confirmedVariant.sellingPrice.toString();
      }

      eligibleRows.push({
        parchaRowId: row.id,
        sortOrder: row.sortOrder,
        productId: row.confirmedProductId,
        productName: row.confirmedProduct.name,
        variantId: row.confirmedVariantId || null,
        variantSnapshot: row.confirmedVariant ? row.confirmedVariant.sku : null,
        skuSnapshot: row.confirmedVariant ? row.confirmedVariant.sku : null,
        quantity: numQty.toString(),
        unitOfMeasure: row.revisedUnit ?? row.ocrUnit ?? '',
        unitRate: initialUnitRate,
        sourceOriginalText: row.ocrOriginalText,
        sourceRevisedName: row.revisedProductName ?? row.ocrProductName ?? '',
        sourceDescription: row.revisedDescription ?? row.ocrDescription ?? '',
        sourceSize: row.revisedSize ?? row.ocrSize ?? '',
      });
    }

    const customers = await prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      job: {
        id: job.id,
        originalFilename: job.originalFilename,
        status: job.status,
        uploaderId: job.uploaderId
      },
      eligibleRows,
      excludedRows,
      customers: customers.map(CustomerService.toSafeCustomer)
    });
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Error retrieving parcha estimate draft preview');
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('estimates:create');
    await requirePermission('parcha:read');

    const body = await req.json();
    const parsed = createParchaEstimateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }

    const data = parsed.data;
    const idempotencyKey = req.headers.get('idempotency-key') || undefined;

    // Fast-path / pre-check for idempotency replay or payload conflict
    if (idempotencyKey) {
      const existing = await prisma.estimate.findUnique({
        where: { idempotencyKey },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true }
      });
      if (existing) {
        if (user.role !== 'OWNER' && existing.creatorId !== user.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const isEquivalent = EstimateService.isEquivalentEstimatePayload(existing, {
          customerId: data.customerId,
          parchaJobId: id,
          notes: data.notes,
          terms: data.terms,
          lines: data.lines
        });
        if (!isEquivalent) {
          return NextResponse.json({
            error: 'Idempotency key already used for a different estimate payload'
          }, { status: 409 });
        }
        return NextResponse.json({ estimate: EstimateService.toSafeEstimate(existing), replayed: true }, { status: 200 });
      }
    }

    // 1. Prevent duplicate source-row references in a single estimate
    const seenParchaRowIds = new Set<string>();
    for (const line of data.lines) {
      if (line.parchaRowId) {
        if (seenParchaRowIds.has(line.parchaRowId)) {
          return NextResponse.json({
            error: `Duplicate source row reference: row ${line.parchaRowId} cannot be referenced more than once`
          }, { status: 400 });
        }
        seenParchaRowIds.add(line.parchaRowId);
      }
    }

    const parchaRowIds = Array.from(seenParchaRowIds).sort((a, b) => a.localeCompare(b));
    const lineProductIds = (data.lines.map(l => l.productId).filter(Boolean) as string[]);
    const lineVariantIds = (data.lines.map(l => l.variantId).filter(Boolean) as string[]);

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        const estimate = await prisma.$transaction(async (tx) => {
          // --- Lock Hierarchy Level 1: ParchaJob ---
          const jobLock = await tx.$queryRaw<{ id: string; uploaderId: string; status: string }[]>`
            SELECT id, "uploaderId", status FROM "ParchaJob"
            WHERE id = ${id}
            FOR SHARE
          `;
          const job = Array.isArray(jobLock) && jobLock.length > 0 ? jobLock[0] : null;
          if (!job) {
            throw new NotFoundError('Job not found');
          }
          if (user.role !== 'OWNER' && job.uploaderId !== user.id) {
            throw new ForbiddenError('Forbidden');
          }
          if (job.status !== 'REVIEW_REQUIRED' && job.status !== 'COMPLETED') {
            throw new ValidationError(`Cannot create estimate draft from job in ${job.status} state. Job must be reviewed first.`);
          }

          if (process.env.NODE_ENV === 'test' && activeEstimateTestHook) {
            await activeEstimateTestHook('after-job-lock');
          }

          // --- Pre-fetch candidate row references (unlocked) to identify products & variants ---
          const candidateRows = parchaRowIds.length > 0
            ? await tx.parchaJobRow.findMany({
                where: { id: { in: parchaRowIds }, jobId: id },
                select: { id: true, confirmedProductId: true, confirmedVariantId: true }
              })
            : [];

          const allProductIds = Array.from(new Set([
            ...lineProductIds,
            ...candidateRows.map(r => r.confirmedProductId).filter(Boolean) as string[]
          ])).sort((a, b) => a.localeCompare(b));

          const allVariantIds = Array.from(new Set([
            ...lineVariantIds,
            ...candidateRows.map(r => r.confirmedVariantId).filter(Boolean) as string[]
          ])).sort((a, b) => a.localeCompare(b));

          // --- Lock Hierarchy Level 2: Product ---
          const productMap = new Map<string, { id: string; name: string; isActive: boolean }>();
          for (const pid of allProductIds) {
            const pRows = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
              SELECT id, name, "isActive" FROM "Product"
              WHERE id = ${pid}
              FOR SHARE
            `;
            const p = Array.isArray(pRows) && pRows.length > 0 ? pRows[0] : null;
            if (!p || !p.isActive) {
              throw new ValidationError(`Product ${pid} is invalid or inactive`);
            }
            productMap.set(pid, p);
          }

          // --- Lock Hierarchy Level 3: ProductVariant ---
          const variantMap = new Map<string, { id: string; productId: string; sku: string; isActive: boolean }>();
          for (const vid of allVariantIds) {
            const vRows = await tx.$queryRaw<{ id: string; productId: string; sku: string; isActive: boolean }[]>`
              SELECT id, "productId", sku, "isActive" FROM "ProductVariant"
              WHERE id = ${vid}
              FOR SHARE
            `;
            const v = Array.isArray(vRows) && vRows.length > 0 ? vRows[0] : null;
            if (!v || !v.isActive) {
              throw new ValidationError(`Variant ${vid} is invalid or inactive`);
            }
            variantMap.set(vid, v);
          }

          if (process.env.NODE_ENV === 'test' && activeEstimateTestHook) {
            await activeEstimateTestHook('after-catalogue-locks');
          }

          // --- Lock Hierarchy Level 4: ParchaJobRow ---
          // Fetch and lock referenced rows in strictly ascending ID order
          const rowMap = new Map<string, any>();
          for (const rid of parchaRowIds) {
            const rows = await tx.$queryRaw<{
              id: string;
              jobId: string;
              confirmedProductId: string | null;
              confirmedVariantId: string | null;
              revisedQuantity: string | null;
              ocrQuantity: string | null;
            }[]>`
              SELECT id, "jobId", "confirmedProductId", "confirmedVariantId", "revisedQuantity", "ocrQuantity"
              FROM "ParchaJobRow"
              WHERE id = ${rid}
              FOR SHARE
            `;
            const r = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            if (!r) {
              throw new ValidationError(`Row ${rid} does not exist`);
            }
            if (r.jobId !== id) {
              throw new ValidationError(`Row ${rid} does not belong to Parcha Job ${id}`);
            }
            if (!r.confirmedProductId) {
              throw new ValidationError(`Row ${rid} is not confirmed to a catalogue product`);
            }
            if (!productMap.has(r.confirmedProductId)) {
              throw new ValidationError(`Product ${r.confirmedProductId} is not covered by acquired locks`);
            }
            if (r.confirmedVariantId && !variantMap.has(r.confirmedVariantId)) {
              throw new ValidationError(`Variant ${r.confirmedVariantId} is not covered by acquired locks`);
            }
            rowMap.set(rid, r);
          }

          if (process.env.NODE_ENV === 'test' && activeEstimateTestHook) {
            await activeEstimateTestHook('after-row-locks');
          }

          // --- Validate Lines Against Confirmed Source Rows & Catalogue ---
          for (const line of data.lines) {
            if (line.parchaRowId) {
              const sourceRow = rowMap.get(line.parchaRowId);
              if (!sourceRow) {
                throw new ValidationError(`Row ${line.parchaRowId} not found in locked job rows`);
              }

              // Submitted productId (if present) must match confirmedProductId
              if (line.productId && line.productId !== sourceRow.confirmedProductId) {
                throw new ValidationError(
                  `Line product ${line.productId} does not match confirmed product ${sourceRow.confirmedProductId}`
                );
              }

              // Variant check
              if (sourceRow.confirmedVariantId) {
                if (line.variantId && line.variantId !== sourceRow.confirmedVariantId) {
                  throw new ValidationError(
                    `Line variant ${line.variantId} does not match confirmed variant ${sourceRow.confirmedVariantId}`
                  );
                }
              } else {
                // If row has no confirmed variant, line cannot attach an unconfirmed variant
                if (line.variantId) {
                  throw new ValidationError(
                    `Cannot attach variant ${line.variantId} to product-only confirmed row ${sourceRow.id}`
                  );
                }
              }

              // Verify referenced variant belongs to the confirmed product
              if (line.variantId) {
                const variant = variantMap.get(line.variantId);
                if (!variant || variant.productId !== sourceRow.confirmedProductId) {
                  throw new ValidationError(
                    `Variant ${line.variantId} does not belong to confirmed product ${sourceRow.confirmedProductId}`
                  );
                }
              }
            } else {
              // Manual line without parchaRowId: if variantId and productId provided, verify variant belongs to product
              if (line.variantId && line.productId) {
                const variant = variantMap.get(line.variantId);
                if (!variant || variant.productId !== line.productId) {
                  throw new ValidationError(
                    `Variant ${line.variantId} does not belong to product ${line.productId}`
                  );
                }
              }
            }
          }

          if (process.env.NODE_ENV === 'test' && activeEstimateTestHook) {
            await activeEstimateTestHook('before-customer-lock');
          }

          // --- Lock Hierarchy Level 5: Customer ---
          // Acquire FOR SHARE lock on Customer row to ensure active-state consistency through commit
          if (data.customerId) {
            const customerRows = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
              SELECT id, "isActive" FROM "Customer"
              WHERE id = ${data.customerId}
              FOR SHARE
            `;
            const customer = Array.isArray(customerRows) && customerRows.length > 0 ? customerRows[0] : null;
            if (!customer || !customer.isActive) {
              throw new ValidationError('Selected customer is invalid or inactive');
            }
          }

          if (process.env.NODE_ENV === 'test' && activeEstimateTestHook) {
            await activeEstimateTestHook('after-customer-lock');
          }

          // Create estimate using EstimateService inside this exact transaction
          return await EstimateService.createEstimate({
            customerId: data.customerId,
            issueDate: data.issueDate,
            validityDate: data.validityDate,
            notes: data.notes,
            terms: data.terms,
            creatorId: user.id,
            idempotencyKey,
            parchaJobId: id,
            lines: data.lines.map(l => ({
              variantId: l.variantId,
              parchaRowId: l.parchaRowId,
              productSnapshot: l.productSnapshot,
              variantSnapshot: l.variantSnapshot,
              skuSnapshot: l.skuSnapshot,
              quantity: l.quantity,
              unitOfMeasure: l.unitOfMeasure,
              unitRate: l.unitRate,
              discountAmount: l.discountAmount,
              taxRate: l.taxRate,
            }))
          }, tx);
        });

        return NextResponse.json({ estimate }, { status: 201 });
      } catch (err: any) {
        lastError = err;

        // Bounded recovery on concurrent P2002 collision
        if (
          err?.code === 'P2002' &&
          idempotencyKey &&
          (err.meta?.target?.includes('idempotencyKey') || err.message?.includes('idempotencyKey'))
        ) {
          let existing = null;
          const MAX_POLLS = 10;
          for (let poll = 0; poll < MAX_POLLS; poll++) {
            existing = await prisma.estimate.findUnique({
              where: { idempotencyKey },
              include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true }
            });
            if (existing) break;
            await new Promise(r => setTimeout(r, 20 * (poll + 1)));
          }

          if (existing) {
            if (user.role !== 'OWNER' && existing.creatorId !== user.id) {
              return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            const isEquivalent = EstimateService.isEquivalentEstimatePayload(existing, {
              customerId: data.customerId,
              parchaJobId: id,
              notes: data.notes,
              terms: data.terms,
              lines: data.lines
            });
            if (!isEquivalent) {
              return NextResponse.json({
                error: 'Idempotency key already used for a different estimate payload'
              }, { status: 409 });
            }
            return NextResponse.json({
              estimate: EstimateService.toSafeEstimate(existing),
              replayed: true
            }, { status: 200 });
          }

          // If existing is still null, concurrent winner aborted. Retry transaction.
          if (attempt < MAX_TRANSACTION_RETRIES) {
            logger.warn({ attempt, jobId: id }, 'Concurrent idempotency transaction rolled back; retrying...');
            continue;
          }
        }

        if (isRetryableDbError(err) && attempt < MAX_TRANSACTION_RETRIES) {
          logger.warn({ attempt, jobId: id, error: err.message }, 'Retryable database transaction error encountered, retrying...');
          const backoffMs = Math.min(50 * Math.pow(2, attempt - 1) + Math.random() * 20, 500);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        break;
      }
    }

    if (
      lastError?.code === 'P2002' &&
      idempotencyKey &&
      (lastError.meta?.target?.includes('idempotencyKey') || lastError.message?.includes('idempotencyKey'))
    ) {
      let existing = null;
      for (let poll = 0; poll < 5; poll++) {
        existing = await prisma.estimate.findUnique({
          where: { idempotencyKey },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true }
        });
        if (existing) break;
        await new Promise(r => setTimeout(r, 25 * (poll + 1)));
      }

      if (existing) {
        if (user.role !== 'OWNER' && existing.creatorId !== user.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const isEquivalent = EstimateService.isEquivalentEstimatePayload(existing, {
          customerId: data.customerId,
          parchaJobId: id,
          notes: data.notes,
          terms: data.terms,
          lines: data.lines
        });
        if (!isEquivalent) {
          return NextResponse.json({
            error: 'Idempotency key already used for a different estimate payload'
          }, { status: 409 });
        }
        return NextResponse.json({ estimate: EstimateService.toSafeEstimate(existing), replayed: true }, { status: 200 });
      }
    }

    if (lastError instanceof NotFoundError) {
      return NextResponse.json({ error: lastError.message }, { status: 404 });
    }
    if (lastError instanceof ForbiddenError || lastError?.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (lastError instanceof ConflictError || lastError?.message?.includes('Idempotency key')) {
      return NextResponse.json({ error: lastError.message }, { status: 409 });
    }
    if (lastError instanceof ValidationError) {
      return NextResponse.json({ error: lastError.message }, { status: 400 });
    }

    throw lastError;
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Failed to create estimate from parcha');
    const status = error.message === 'Forbidden' ? 403 : error.statusCode || 500;
    return NextResponse.json({ error: error.message || 'Internal error' }, { status });
  }
}
