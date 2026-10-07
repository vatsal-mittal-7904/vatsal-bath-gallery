/* eslint-disable @typescript-eslint/no-explicit-any */
import * as authGuard from '../../src/features/auth/auth.guard';
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { NextRequest } from 'next/server';
import { PATCH, __setTestHook, isRetryableDbError } from '../../src/app/api/v1/parcha-jobs/[id]/extraction/route';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Production-Grade PostgreSQL Concurrency & Lock Integrity (Phase 6.3.2.5)', () => {
  let user: any;
  let cat: any;

  beforeAll(async () => {
    vi.spyOn(authGuard, 'requirePermission').mockResolvedValue({
      id: 'test-owner',
      role: 'OWNER',
      email: 'owner@test.com',
      name: 'Owner',
      isActive: true,
    } as any);

    await cleanupDatabase();

    user = await prisma.user.create({
      data: { id: 'test-owner', email: 'owner@test.com', name: 'Owner', role: 'OWNER', passwordHash: 'dummy' },
    });

    cat = await CatalogueService.createCategory({ name: 'Testing Cat', isActive: true });
  });

  afterAll(async () => {
    __setTestHook(null);
    vi.restoreAllMocks();
    await cleanupDatabase();
  });

  beforeEach(() => {
    __setTestHook(null);
  });

  afterEach(() => {
    __setTestHook(null);
  });

  async function cleanupDatabase() {
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  }

  const createJobAndRow = async (idPrefix: string) => {
    const job = await prisma.parchaJob.create({
      data: {
        id: `job-${idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        uploaderId: user.id,
        originalFilename: `${idPrefix}.jpg`,
        storageKey: `key-${idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        status: 'REVIEW_REQUIRED',
        rawOcrText: 'raw OCR text',
        processingToken: `token-${idPrefix}-${Date.now()}`,
      },
    });
    const row = await prisma.parchaJobRow.create({
      data: {
        jobId: job.id,
        ocrOriginalText: 'original OCR text',
        ocrProductName: 'original product name',
        ocrNormalizedProductName: 'normalized product name',
        version: 0,
      },
    });
    return { job, row };
  };

  /**
   * Helper that polls PostgreSQL's actual pg_locks and pg_stat_activity system tables
   * to deterministically verify that a specific number of transactions are actively blocked
   * waiting on a row lock.
   */
  async function waitForBlockedLockCount(
    querySubstr: string,
    expectedCount: number,
    timeoutMs = 10000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ungranted = await prisma.$queryRaw<any[]>`
        SELECT l.pid, l.locktype, l.mode, a.query 
        FROM pg_locks l 
        JOIN pg_stat_activity a ON l.pid = a.pid 
        WHERE NOT l.granted AND a.query LIKE ${'%' + querySubstr + '%'}
      `;
      if (ungranted.length >= expectedCount) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  }

  // =========================================================================
  // SECTION 1: Retry Classification Unit Verification
  // =========================================================================

  describe('Retry Classification & Safety', () => {
    it('correctly identifies retryable PostgreSQL error codes (40P01, 40001)', () => {
      expect(isRetryableDbError({ code: '40P01' })).toBe(true);
      expect(isRetryableDbError({ code: '40001' })).toBe(true);
    });

    it('correctly identifies Prisma P2034 transaction conflict', () => {
      expect(isRetryableDbError({ code: 'P2034' })).toBe(true);
    });

    it('correctly identifies Prisma P2010 only when underlying code is 40P01 or 40001', () => {
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
      // Non-conflict raw query errors must NOT be retried
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '42601' } })).toBe(false); // syntax error
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '23505' } })).toBe(false); // unique violation
      expect(isRetryableDbError({ code: 'P2010' })).toBe(false);
    });

    it('rejects permanent failures and non-retryable domain errors', () => {
      expect(isRetryableDbError(null)).toBe(false);
      expect(isRetryableDbError(undefined)).toBe(false);
      expect(isRetryableDbError(new Error('STATUS_CONFLICT'))).toBe(false);
      expect(isRetryableDbError(new Error('VERSION_CONFLICT'))).toBe(false);
      expect(isRetryableDbError(new Error('VARIANT_INVALID'))).toBe(false);
      expect(isRetryableDbError(new Error('VARIANT_MISMATCH'))).toBe(false);
      expect(isRetryableDbError(new Error('PRODUCT_INVALID'))).toBe(false);
      expect(isRetryableDbError(new Error('Forbidden'))).toBe(false);
      expect(isRetryableDbError({ code: 'P2002' })).toBe(false); // Unique constraint
      expect(isRetryableDbError({ code: 'P2003' })).toBe(false); // Foreign key constraint
      expect(isRetryableDbError({ code: 'P2025' })).toBe(false); // Record not found
    });
  });

  // =========================================================================
  // SECTION 2: Mandatory Deterministic Concurrency Scenarios
  // =========================================================================

  it('Scenario A: Two simultaneous edits to the same OCR row (with pg_locks proof)', async () => {
    const { job, row } = await createJobAndRow('scen-a');

    let releaseHold: () => void;
    const holdPromise = new Promise<void>((r) => { releaseHold = r; });

    const holdTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ParchaJob" WHERE id = ${job.id} FOR UPDATE`;
      await holdPromise;
    });

    try {
      const reqA = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, revisedProductName: 'Winner Candidate A', version: 0 }] }),
      });
      const reqB = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, revisedProductName: 'Winner Candidate B', version: 0 }] }),
      });

      const promiseA = PATCH(reqA, { params: Promise.resolve({ id: job.id }) });
      const promiseB = PATCH(reqB, { params: Promise.resolve({ id: job.id }) });

      // EMPIRICAL PROOF: Inspect pg_locks to verify BOTH requests are actively
      // suspended waiting on the ParchaJob row lock in PostgreSQL
      const blocked = await waitForBlockedLockCount('ParchaJob', 2);
      expect(blocked).toBe(true);

      releaseHold!();
      await holdTx;

      const [resA, resB] = await Promise.all([promiseA, promiseB]);
      const statuses = [resA.status, resB.status];

      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      const updatedRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(updatedRow?.version).toBe(1);
      expect(updatedRow?.revisedProductName).toBe(resA.status === 200 ? 'Winner Candidate A' : 'Winner Candidate B');
      expect(updatedRow?.ocrOriginalText).toBe('original OCR text');
    } finally {
      releaseHold!();
      await holdTx.catch(() => {});
    }
  }, 15000);

  it('Scenario B: Two simultaneous candidate confirmations (with pg_locks proof)', async () => {
    const { job, row } = await createJobAndRow('scen-b');
    const product1 = await CatalogueService.createProduct({
      name: 'Product 1', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-B1', sellingPrice: 15, isActive: true, attributes: {} }],
    });
    const product2 = await CatalogueService.createProduct({
      name: 'Product 2', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-B2', sellingPrice: 25, isActive: true, attributes: {} }],
    });

    let releaseHold: () => void;
    const holdPromise = new Promise<void>((r) => { releaseHold = r; });

    const holdTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ParchaJob" WHERE id = ${job.id} FOR UPDATE`;
      await holdPromise;
    });

    try {
      const reqA = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: [{
            id: row.id,
            confirmedProductId: product1.id,
            confirmedVariantId: (product1 as any).variants[0].id,
            revisedProductName: 'Confirmed Prod 1',
            version: 0,
          }],
        }),
      });
      const reqB = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: [{
            id: row.id,
            confirmedProductId: product2.id,
            confirmedVariantId: (product2 as any).variants[0].id,
            revisedProductName: 'Confirmed Prod 2',
            version: 0,
          }],
        }),
      });

      const promiseA = PATCH(reqA, { params: Promise.resolve({ id: job.id }) });
      const promiseB = PATCH(reqB, { params: Promise.resolve({ id: job.id }) });

      const blocked = await waitForBlockedLockCount('ParchaJob', 2);
      expect(blocked).toBe(true);

      releaseHold!();
      await holdTx;

      const [resA, resB] = await Promise.all([promiseA, promiseB]);
      expect([resA.status, resB.status]).toContain(200);
      expect([resA.status, resB.status]).toContain(409);

      const updatedRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(updatedRow?.version).toBe(1);

      const winnerIsA = resA.status === 200;
      expect(updatedRow?.confirmedProductId).toBe(winnerIsA ? product1.id : product2.id);
      expect(updatedRow?.confirmedVariantId).toBe(winnerIsA ? (product1 as any).variants[0].id : (product2 as any).variants[0].id);
      expect(updatedRow?.ocrOriginalText).toBe('original OCR text');
      expect(updatedRow?.ocrProductName).toBe('original product name');
    } finally {
      releaseHold!();
      await holdTx.catch(() => {});
    }
  });

  it('Scenario C1: Confirmation racing with job status transition (Status transition commits first)', async () => {
    const { job, row } = await createJobAndRow('scen-c1');
    const product = await CatalogueService.createProduct({ name: 'Prod C1', categoryId: cat.id, isActive: true, variants: [] });

    let releaseHold: () => void;
    const holdPromise = new Promise<void>((r) => { releaseHold = r; });

    const holdTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ParchaJob" WHERE id = ${job.id} FOR UPDATE`;
      await holdPromise;
      await tx.$executeRaw`UPDATE "ParchaJob" SET status = 'COMPLETED'::"ParchaJobStatus" WHERE id = ${job.id}`;
    });

    try {
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
      });
      const promisePatch = PATCH(req, { params: Promise.resolve({ id: job.id }) });

      const blocked = await waitForBlockedLockCount('ParchaJob', 1);
      expect(blocked).toBe(true);

      releaseHold!();
      await holdTx;

      const res = await promisePatch;
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('Job is not in review phase');

      const updatedRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(updatedRow?.version).toBe(0);
      expect(updatedRow?.confirmedProductId).toBeNull();
    } finally {
      releaseHold!();
      await holdTx.catch(() => {});
    }
  });

  it('Scenario C2: Confirmation racing with job status transition (Confirmation acquires lock first)', async () => {
    const { job, row } = await createJobAndRow('scen-c2');
    const product = await CatalogueService.createProduct({ name: 'Prod C2', categoryId: cat.id, isActive: true, variants: [] });

    let releaseHook: () => void;
    const hookPromise = new Promise<void>((r) => { releaseHook = r; });

    __setTestHook(async (stage) => {
      if (stage === 'after-job-lock') {
        await hookPromise;
      }
    });

    try {
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
      });

      const confirmationPromise = PATCH(req, { params: Promise.resolve({ id: job.id }) });

      const statusTransitionPromise = (async () => {
        await new Promise(r => setTimeout(r, 50));
        return prisma.$executeRaw`UPDATE "ParchaJob" SET status = 'COMPLETED'::"ParchaJobStatus" WHERE id = ${job.id}`;
      })();

      const blocked = await waitForBlockedLockCount('ParchaJob', 1);
      expect(blocked).toBe(true);

      releaseHook!();

      const res = await confirmationPromise;
      expect(res.status).toBe(200);

      await statusTransitionPromise;

      const finalJob = await prisma.parchaJob.findUnique({ where: { id: job.id } });
      expect(finalJob?.status).toBe('COMPLETED');

      const finalRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(finalRow?.version).toBe(1);
      expect(finalRow?.confirmedProductId).toBe(product.id);
    } finally {
      releaseHook!();
    }
  });

  it('Scenario D1: Confirmation racing with catalogue deactivation (Deactivation wins first)', async () => {
    const { job, row } = await createJobAndRow('scen-d1');
    const product = await CatalogueService.createProduct({ name: 'Prod D1', categoryId: cat.id, isActive: true, variants: [] });

    let releaseHold: () => void;
    const holdPromise = new Promise<void>((r) => { releaseHold = r; });

    const holdTx = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`;
      await holdPromise;
      await tx.$executeRaw`UPDATE "Product" SET "isActive" = false WHERE id = ${product.id}`;
    });

    try {
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
      });
      const promisePatch = PATCH(req, { params: Promise.resolve({ id: job.id }) });

      const blocked = await waitForBlockedLockCount('Product', 1);
      expect(blocked).toBe(true);

      releaseHold!();
      await holdTx;

      const res = await promisePatch;
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Product is invalid or inactive');

      const updatedRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(updatedRow?.version).toBe(0);
      expect(updatedRow?.confirmedProductId).toBeNull();
    } finally {
      releaseHold!();
      await holdTx.catch(() => {});
    }
  });

  it('Scenario D2: Confirmation racing with catalogue deactivation (Confirmation acquires lock first)', async () => {
    const { job, row } = await createJobAndRow('scen-d2');
    const product = await CatalogueService.createProduct({ name: 'Prod D2', categoryId: cat.id, isActive: true, variants: [] });

    let releaseHook: () => void;
    const hookPromise = new Promise<void>((r) => { releaseHook = r; });

    __setTestHook(async (stage) => {
      if (stage === 'after-catalogue-locks') {
        await hookPromise;
      }
    });

    try {
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
      });

      const confirmationPromise = PATCH(req, { params: Promise.resolve({ id: job.id }) });

      const archivePromise = (async () => {
        await new Promise(r => setTimeout(r, 50));
        return CatalogueService.archiveProduct(product.id);
      })();

      const blocked = await waitForBlockedLockCount('Product', 1);
      expect(blocked).toBe(true);

      releaseHook!();

      const res = await confirmationPromise;
      expect(res.status).toBe(200);

      await archivePromise;

      const finalProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(finalProduct?.isActive).toBe(false);

      const finalRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
      expect(finalRow?.version).toBe(1);
      expect(finalRow?.confirmedProductId).toBe(product.id);
    } finally {
      releaseHook!();
    }
  });

  // =========================================================================
  // SECTION 3: Lock Order Hierarchy and Deadlock Prevention Tests
  // =========================================================================

  it('Deadlock Prevention: Overlapping multi-product updates submitted in opposite order complete safely', async () => {
    const { job: job1, row: row1A } = await createJobAndRow('dl-1a');
    const row1B = await prisma.parchaJobRow.create({
      data: { jobId: job1.id, ocrOriginalText: 'row 1b', version: 0 },
    });

    const { job: job2, row: row2A } = await createJobAndRow('dl-2a');
    const row2B = await prisma.parchaJobRow.create({
      data: { jobId: job2.id, ocrOriginalText: 'row 2b', version: 0 },
    });

    const prodA = await CatalogueService.createProduct({ name: 'Alpha Prod', categoryId: cat.id, isActive: true, variants: [] });
    const prodB = await CatalogueService.createProduct({ name: 'Beta Prod', categoryId: cat.id, isActive: true, variants: [] });

    // Request 1 submits [Product B, Product A]
    const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job1.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [
          { id: row1A.id, confirmedProductId: prodB.id, version: 0 },
          { id: row1B.id, confirmedProductId: prodA.id, version: 0 },
        ],
      }),
    });

    // Request 2 submits [Product A, Product B]
    const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job2.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [
          { id: row2A.id, confirmedProductId: prodA.id, version: 0 },
          { id: row2B.id, confirmedProductId: prodB.id, version: 0 },
        ],
      }),
    });

    // Both requests run concurrently. Because the API route sorts product IDs in ascending
    // order prior to acquiring locks, both transactions acquire locks in identical order (A, then B).
    const [res1, res2] = await Promise.all([
      PATCH(req1, { params: Promise.resolve({ id: job1.id }) }),
      PATCH(req2, { params: Promise.resolve({ id: job2.id }) }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const r1A = await prisma.parchaJobRow.findUnique({ where: { id: row1A.id } });
    const r2A = await prisma.parchaJobRow.findUnique({ where: { id: row2A.id } });
    expect(r1A?.version).toBe(1);
    expect(r2A?.version).toBe(1);
  });

  // =========================================================================
  // SECTION 4: Catalogue Lifecycle Predicates Under Lock
  // =========================================================================

  it('validates active product without variant (product-only confirmation)', async () => {
    const { job, row } = await createJobAndRow('prod-only');
    const product = await CatalogueService.createProduct({ name: 'Product Only', categoryId: cat.id, isActive: true, variants: [] });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.confirmedProductId).toBe(product.id);
    expect(dbRow?.confirmedVariantId).toBeNull();
    expect(dbRow?.version).toBe(1);
  });

  it('validates active product with valid variant', async () => {
    const { job, row } = await createJobAndRow('prod-var');
    const product = await CatalogueService.createProduct({
      name: 'Product With Variant', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-PV1', sellingPrice: 50, isActive: true, attributes: {} }],
    });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{
          id: row.id,
          confirmedProductId: product.id,
          confirmedVariantId: (product as any).variants[0].id,
          version: 0,
        }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.confirmedProductId).toBe(product.id);
    expect(dbRow?.confirmedVariantId).toBe((product as any).variants[0].id);
    expect(dbRow?.version).toBe(1);
  });

  it('rejects nonexistent product and leaves row unchanged', async () => {
    const { job, row } = await createJobAndRow('no-prod');

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: '00000000-0000-0000-0000-000000000000', version: 0 }] }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Product is invalid or inactive');

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
    expect(dbRow?.confirmedProductId).toBeNull();
  });

  it('rejects nonexistent variant and leaves row unchanged', async () => {
    const { job, row } = await createJobAndRow('no-var');
    const product = await CatalogueService.createProduct({ name: 'Prod Real', categoryId: cat.id, isActive: true, variants: [] });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{
          id: row.id,
          confirmedProductId: product.id,
          confirmedVariantId: '00000000-0000-0000-0000-000000000000',
          version: 0,
        }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Variant is invalid or inactive');

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
  });

  it('rejects variant belonging to a different product', async () => {
    const { job, row } = await createJobAndRow('mismatch-var');
    const prodA = await CatalogueService.createProduct({
      name: 'Prod A', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-A-1', sellingPrice: 10, isActive: true, attributes: {} }],
    });
    const prodB = await CatalogueService.createProduct({
      name: 'Prod B', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-B-1', sellingPrice: 20, isActive: true, attributes: {} }],
    });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{
          id: row.id,
          confirmedProductId: prodA.id,
          confirmedVariantId: (prodB as any).variants[0].id,
          version: 0,
        }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Variant does not belong to the specified product');

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
  });

  it('rejects inactive or archived variant', async () => {
    const { job, row } = await createJobAndRow('inact-var');
    const product = await CatalogueService.createProduct({
      name: 'Prod Inact Var', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-INACT', sellingPrice: 30, isActive: true, attributes: {} }],
    });
    const variantId = (product as any).variants[0].id;
    await CatalogueService.archiveVariant(variantId);

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{
          id: row.id,
          confirmedProductId: product.id,
          confirmedVariantId: variantId,
          version: 0,
        }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Variant is invalid or inactive');

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
  });

  it('rejects variant supplied without confirmedProductId', async () => {
    const { job, row } = await createJobAndRow('var-no-prod');
    const product = await CatalogueService.createProduct({
      name: 'Prod VNP', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-VNP', sellingPrice: 12, isActive: true, attributes: {} }],
    });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [{
          id: row.id,
          confirmedProductId: null,
          confirmedVariantId: (product as any).variants[0].id,
          version: 0,
        }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
  });

  // =========================================================================
  // SECTION 5 & 6: Timestamp Semantics & Stale Replay Idempotency
  // =========================================================================

  it('Timestamp Semantics: row edit lock does NOT alter ParchaJob.updatedAt', async () => {
    const { job, row } = await createJobAndRow('ts-sem');

    const initialJob = await prisma.parchaJob.findUnique({ where: { id: job.id } });
    const initialUpdatedAt = initialJob?.updatedAt.getTime();

    await new Promise(r => setTimeout(r, 20));

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, revisedProductName: 'Updated Name', version: 0 }] }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);

    const postJob = await prisma.parchaJob.findUnique({ where: { id: job.id } });
    expect(postJob?.updatedAt.getTime()).toBe(initialUpdatedAt);
  });

  it('Stale replay idempotency: repeating stale request fails with 409 and does not increment version', async () => {
    const { job, row } = await createJobAndRow('replay');
    const product = await CatalogueService.createProduct({ name: 'Prod Replay', categoryId: cat.id, isActive: true, variants: [] });

    const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
    });
    const res1 = await PATCH(req1, { params: Promise.resolve({ id: job.id }) });
    expect(res1.status).toBe(200);

    const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, confirmedProductId: product.id, version: 0 }] }),
    });
    const res2 = await PATCH(req2, { params: Promise.resolve({ id: job.id }) });
    expect(res2.status).toBe(409);

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(1); // Not 2!
  });

  it('No partial persistence: failure on one row rolls back the entire batch', async () => {
    const { job, row: row1 } = await createJobAndRow('partial-1');
    const row2 = await prisma.parchaJobRow.create({
      data: { jobId: job.id, ocrOriginalText: 'row 2', version: 0 },
    });
    const product = await CatalogueService.createProduct({ name: 'Prod Valid Part', categoryId: cat.id, isActive: true, variants: [] });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({
        rows: [
          { id: row1.id, confirmedProductId: product.id, revisedProductName: 'Row 1 Should Rollback', version: 0 },
          { id: row2.id, confirmedProductId: '00000000-0000-0000-0000-000000000000', version: 0 },
        ],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);

    const r1 = await prisma.parchaJobRow.findUnique({ where: { id: row1.id } });
    const r2 = await prisma.parchaJobRow.findUnique({ where: { id: row2.id } });
    expect(r1?.version).toBe(0);
    expect(r1?.confirmedProductId).toBeNull();
    expect(r1?.revisedProductName).toBeNull();
    expect(r2?.version).toBe(0);
  });

  it('Retry exhaustion on persistent deadlock/serialization conflict returns 409', async () => {
    const { job, row } = await createJobAndRow('retry-exhaust');

    let attemptCount = 0;
    __setTestHook(async (stage) => {
      if (stage === 'after-job-lock') {
        attemptCount++;
        const deadlockError: any = new Error('deadlock detected');
        deadlockError.code = '40P01';
        throw deadlockError;
      }
    });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, revisedProductName: 'Never Persisted', version: 0 }] }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Database transaction conflict. Please retry.');
    expect(attemptCount).toBe(3); // Exactly MAX_TRANSACTION_RETRIES

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(0);
  });

  it('Transient deadlock succeeds upon retry without duplicate increments', async () => {
    const { job, row } = await createJobAndRow('retry-success');

    let attemptCount = 0;
    __setTestHook(async (stage) => {
      if (stage === 'after-job-lock') {
        attemptCount++;
        if (attemptCount === 1) {
          const deadlockError: any = new Error('deadlock detected');
          deadlockError.code = '40P01';
          throw deadlockError;
        }
      }
    });

    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${job.id}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: [{ id: row.id, revisedProductName: 'Success on Attempt 2', version: 0 }] }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);
    expect(attemptCount).toBe(2);

    const dbRow = await prisma.parchaJobRow.findUnique({ where: { id: row.id } });
    expect(dbRow?.version).toBe(1); // Exactly 1 increment despite 1 retry!
    expect(dbRow?.revisedProductName).toBe('Success on Attempt 2');
  });
});
