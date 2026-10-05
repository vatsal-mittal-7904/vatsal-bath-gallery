/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db/client';
import { GET, POST, __setEstimateTestHook } from '../../src/app/api/v1/parcha-jobs/[id]/estimate/route';
import { PATCH as extractionPATCH } from '../../src/app/api/v1/parcha-jobs/[id]/extraction/route';
import { BillingCalculationService } from '../../src/features/billing/billing-calculation.service';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';
import { CustomerService } from '../../src/features/billing/customer.service';
import * as authGuard from '../../src/features/auth/auth.guard';
import { EstimateStatus } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Parcha to Estimate Draft Integration (Phase 6.3.3.1.2 Audit)', () => {
  let ownerUser: any;
  let staff1User: any;
  let staff2User: any;
  let activeCustomer: any;
  let inactiveCustomer: any;

  let activeProductA: any;
  let activeVariantA1: any;
  let activeVariantA2: any;
  let inactiveProduct: any;
  let productWithInactiveVariant: any;
  let productWithoutVariants: any;

  let reviewedJobStaff1: any;
  let processingJobStaff1: any;
  let reviewedJobStaff2: any;

  let rowEligibleVariant: any;
  let rowEligibleNoVariant: any;
  let rowUnconfirmed: any;
  let rowInactiveProduct: any;
  let rowInactiveVariant: any;
  let rowInvalidQty: any;

  beforeAll(async () => {
    // Default mock auth
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      return { id: 'owner-id', role: 'OWNER', email: 'owner@test.com', name: 'Owner', isActive: true } as any;
    });

    // Clean up all tables in proper relational order
    await prisma.payment.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.documentSequence.deleteMany();
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();

    // 1. Create Users
    ownerUser = await prisma.user.create({
      data: { id: 'user-owner', email: 'owner@test.com', name: 'Shop Owner', role: 'OWNER', passwordHash: 'hash' }
    });
    staff1User = await prisma.user.create({
      data: { id: 'user-staff-1', email: 'staff1@test.com', name: 'Staff One', role: 'STAFF', passwordHash: 'hash' }
    });
    staff2User = await prisma.user.create({
      data: { id: 'user-staff-2', email: 'staff2@test.com', name: 'Staff Two', role: 'STAFF', passwordHash: 'hash' }
    });

    // 2. Create Customers
    activeCustomer = await CustomerService.createCustomer({
      name: 'Active Customer',
      phoneNumber: '9876543210',
      isActive: true
    });
    inactiveCustomer = await CustomerService.createCustomer({
      name: 'Inactive Customer',
      phoneNumber: '9876543211',
      isActive: false
    });

    // 3. Create Catalogue Items
    const category = await CatalogueService.createCategory({ name: 'Sanitary Ware', isActive: true });

    // Active Product A with Active Variant A1 ($150 selling, $80 cost) and A2 ($160 selling, $85 cost)
    activeProductA = await CatalogueService.createProduct({
      name: 'Ceramic Basin 18x12',
      categoryId: category.id,
      isActive: true,
      variants: [
        { sku: 'BASIN-1812-WHT', sellingPrice: 150, costPrice: 80, isActive: true, attributes: { color: 'White' } },
        { sku: 'BASIN-1812-BLK', sellingPrice: 160, costPrice: 85, isActive: true, attributes: { color: 'Black' } }
      ]
    });
    activeVariantA1 = activeProductA.variants.find((v: any) => v.sku === 'BASIN-1812-WHT')!;
    activeVariantA2 = activeProductA.variants.find((v: any) => v.sku === 'BASIN-1812-BLK')!;

    // Inactive Product
    inactiveProduct = await CatalogueService.createProduct({
      name: 'Discontinued Faucet',
      categoryId: category.id,
      isActive: false,
      variants: [
        { sku: 'FAUCET-OLD', sellingPrice: 90, costPrice: 40, isActive: true, attributes: {} }
      ]
    });

    // Active Product with Inactive Variant
    productWithInactiveVariant = await CatalogueService.createProduct({
      name: 'Dual Flush Cistern',
      categoryId: category.id,
      isActive: true,
      variants: [
        { sku: 'CISTERN-INACTIVE-VAR', sellingPrice: 200, costPrice: 110, isActive: false, attributes: {} }
      ]
    });

    // Active Product with NO variants (product-level match only)
    productWithoutVariants = await CatalogueService.createProduct({
      name: 'Generic Waste Coupling',
      categoryId: category.id,
      isActive: true,
      variants: []
    });

    // 4. Create Parcha Jobs
    reviewedJobStaff1 = await prisma.parchaJob.create({
      data: {
        id: 'job-reviewed-staff1',
        uploaderId: staff1User.id,
        originalFilename: 'parcha_slip_01.jpg',
        storageKey: 'key_parcha_slip_01',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        status: 'REVIEW_REQUIRED',
        rawOcrText: 'Handwritten parcha slip content',
        processingToken: 'tok_01'
      }
    });

    processingJobStaff1 = await prisma.parchaJob.create({
      data: {
        id: 'job-processing-staff1',
        uploaderId: staff1User.id,
        originalFilename: 'parcha_slip_processing.jpg',
        storageKey: 'key_parcha_slip_proc',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        status: 'PROCESSING',
        rawOcrText: '',
        processingToken: 'tok_02'
      }
    });

    reviewedJobStaff2 = await prisma.parchaJob.create({
      data: {
        id: 'job-reviewed-staff2',
        uploaderId: staff2User.id,
        originalFilename: 'parcha_slip_02.jpg',
        storageKey: 'key_parcha_slip_02',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        status: 'REVIEW_REQUIRED',
        rawOcrText: '',
        processingToken: 'tok_03'
      }
    });

    // 5. Populate Rows for reviewedJobStaff1
    // Row 1: Fully Eligible with confirmed variant
    rowEligibleVariant = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 1,
        ocrOriginalText: '2 pc ceramic basin white',
        ocrProductName: 'ceramic basin white',
        revisedProductName: 'Ceramic Basin White 18x12',
        ocrQuantity: '2',
        revisedQuantity: '2',
        ocrUnit: 'pcs',
        revisedUnit: 'pcs',
        confirmedProductId: activeProductA.id,
        confirmedVariantId: activeVariantA1.id,
        version: 0
      }
    });

    // Row 2: Eligible Product-Only (no variant, manual price required)
    rowEligibleNoVariant = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 2,
        ocrOriginalText: '5 waste coupling brass',
        ocrProductName: 'waste coupling',
        ocrQuantity: '5',
        revisedQuantity: '5',
        ocrUnit: 'pcs',
        confirmedProductId: productWithoutVariants.id,
        confirmedVariantId: null,
        version: 0
      }
    });

    // Row 3: Excluded - Unconfirmed Product
    rowUnconfirmed = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 3,
        ocrOriginalText: '10 mystery bracket unknown',
        ocrProductName: 'mystery bracket',
        ocrQuantity: '10',
        confirmedProductId: null,
        confirmedVariantId: null,
        version: 0
      }
    });

    // Row 4: Excluded - Inactive Product
    rowInactiveProduct = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 4,
        ocrOriginalText: '1 discontinued faucet old model',
        ocrProductName: 'discontinued faucet',
        ocrQuantity: '1',
        confirmedProductId: inactiveProduct.id,
        confirmedVariantId: inactiveProduct.variants[0].id,
        version: 0
      }
    });

    // Row 5: Excluded - Inactive Variant
    rowInactiveVariant = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 5,
        ocrOriginalText: '3 dual flush cistern',
        ocrProductName: 'dual flush cistern',
        ocrQuantity: '3',
        confirmedProductId: productWithInactiveVariant.id,
        confirmedVariantId: productWithInactiveVariant.variants[0].id,
        version: 0
      }
    });

    // Row 6: Excluded - Invalid Quantity (0 or missing)
    rowInvalidQty = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 6,
        ocrOriginalText: 'ceramic basin white no qty',
        ocrProductName: 'ceramic basin white',
        ocrQuantity: null,
        revisedQuantity: '0',
        confirmedProductId: activeProductA.id,
        confirmedVariantId: activeVariantA1.id,
        version: 0
      }
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    __setEstimateTestHook(null);
  });

  afterEach(() => {
    __setEstimateTestHook(null);
  });

  const mockUser = (user: any, throws?: 'unauth' | 'forbidden') => {
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      if (throws === 'unauth') throw new Error('Unauthorized');
      if (throws === 'forbidden') throw new Error('Forbidden');
      return user;
    });
  };

  describe('1. GET /api/v1/parcha-jobs/[id]/estimate (Draft Preview)', () => {
    it('allows OWNER to retrieve draft preview of any job', async () => {
      mockUser(ownerUser);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.job.id).toBe(reviewedJobStaff1.id);
      expect(data.job.originalFilename).toBe('parcha_slip_01.jpg');
      expect(data.eligibleRows).toHaveLength(2);
      expect(data.excludedRows).toHaveLength(4);
      expect(data.customers).toBeDefined();
    });

    it('allows STAFF to retrieve draft preview of their own uploaded job', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job.id).toBe(reviewedJobStaff1.id);
    });

    it('forbids STAFF from retrieving draft preview of another user job', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff2.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff2.id }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden');
    });

    it('rejects access if job is in PROCESSING status (not reviewed)', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${processingJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: processingJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Job must be reviewed first');
    });

    it('returns 404 if parcha job does not exist', async () => {
      mockUser(ownerUser);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/non-existent-id/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);
    });

    it('strictly categorizes eligible rows and pre-fills catalogue variant price', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      const data = await res.json();

      // Row 1: Ceramic Basin with variant
      const line1 = data.eligibleRows.find((r: any) => r.parchaRowId === rowEligibleVariant.id);
      expect(line1).toBeDefined();
      expect(line1.productName).toBe('Ceramic Basin 18x12');
      expect(line1.variantId).toBe(activeVariantA1.id);
      expect(line1.skuSnapshot).toBe('BASIN-1812-WHT');
      expect(line1.quantity).toBe('2');
      expect(line1.unitRate).toBe('150'); // Pre-filled from variant sellingPrice
      expect(line1.sourceOriginalText).toBe('2 pc ceramic basin white');

      // Row 2: Product only without variant -> unitRate should be '0'
      const line2 = data.eligibleRows.find((r: any) => r.parchaRowId === rowEligibleNoVariant.id);
      expect(line2).toBeDefined();
      expect(line2.productName).toBe('Generic Waste Coupling');
      expect(line2.variantId).toBeNull();
      expect(line2.quantity).toBe('5');
      expect(line2.unitRate).toBe('0'); // Manual price required
    });

    it('categorizes excluded rows with accurate, informative reasons', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      const data = await res.json();

      const unconfirmed = data.excludedRows.find((r: any) => r.rowId === rowUnconfirmed.id);
      expect(unconfirmed).toBeDefined();
      expect(unconfirmed.reason).toBe('UNCONFIRMED_PRODUCT');

      const inactiveP = data.excludedRows.find((r: any) => r.rowId === rowInactiveProduct.id);
      expect(inactiveP).toBeDefined();
      expect(inactiveP.reason).toBe('INACTIVE_PRODUCT');

      const inactiveV = data.excludedRows.find((r: any) => r.rowId === rowInactiveVariant.id);
      expect(inactiveV).toBeDefined();
      expect(inactiveV.reason).toBe('INACTIVE_VARIANT');

      const invalidQ = data.excludedRows.find((r: any) => r.rowId === rowInvalidQty.id);
      expect(invalidQ).toBeDefined();
      expect(invalidQ.reason).toBe('INVALID_QUANTITY');
    });

    it('strictly scrubs and redacts confidential fields (costPrice, margin)', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`);
      const res = await GET(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      const rawText = await res.text();

      expect(rawText).not.toContain('"costPrice"');
      expect(rawText).not.toContain('"margin"');

      // Parse and strictly inspect all returned objects
      const data = JSON.parse(rawText);
      for (const row of [...data.eligibleRows, ...data.excludedRows]) {
        expect(row.costPrice).toBeUndefined();
        expect(row.margin).toBeUndefined();
      }
    });
  });

  describe('2. POST /api/v1/parcha-jobs/[id]/estimate (Estimate Draft Creation - Baseline)', () => {
    it('forbids STAFF from creating estimate draft for another user job', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff2.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff2.id }) });
      expect(res.status).toBe(403);
    });

    it('rejects creation for jobs not in REVIEW_REQUIRED or COMPLETED status', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${processingJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: processingJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Job must be reviewed first');
    });

    it('rejects creation if selected customer is inactive (verifying zero side-effects on estimates, lines, and document sequence)', async () => {
      mockUser(staff1User);
      const estimatesBefore = await prisma.estimate.count();
      const linesBefore = await prisma.estimateLine.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'ESTIMATE' } });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: inactiveCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Selected customer is invalid or inactive');

      const estimatesAfter = await prisma.estimate.count();
      const linesAfter = await prisma.estimateLine.count();
      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'ESTIMATE' } });

      expect(estimatesAfter).toBe(estimatesBefore);
      expect(linesAfter).toBe(linesBefore);
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);
    });

    it('rejects lines claiming a parchaRowId that belongs to a different job', async () => {
      mockUser(ownerUser);
      // Create a row on job2
      const otherRow = await prisma.parchaJobRow.create({
        data: {
          jobId: reviewedJobStaff2.id,
          ocrOriginalText: 'other job row',
          confirmedProductId: activeProductA.id,
          version: 0
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: otherRow.id,
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain(`does not belong to Parcha Job ${reviewedJobStaff1.id}`);
    });

    it('rejects lines claiming an unconfirmed parchaRowId', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowUnconfirmed.id,
              productSnapshot: 'Mystery Bracket',
              quantity: '1',
              unitRate: '50'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('is not confirmed to a catalogue product');
    });

    it('successfully creates an editable Estimate draft linking parchaJobId and parchaRowIds', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: '2026-10-03T10:00:00.000Z',
          validityDate: '2026-10-10T10:00:00.000Z',
          notes: 'Customer requested 5% promo discount on coupling',
          terms: 'Standard 7-day estimate validity',
          lines: [
            // Parcha-derived Line 1 (from confirmed variant)
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin 18x12',
              variantSnapshot: 'BASIN-1812-WHT',
              skuSnapshot: 'BASIN-1812-WHT',
              quantity: '2',
              unitOfMeasure: 'pcs',
              unitRate: '150',
              discountAmount: '0',
              taxRate: '18'
            },
            // Parcha-derived Line 2 (product-only match, staff-entered rate)
            {
              parchaRowId: rowEligibleNoVariant.id,
              productSnapshot: 'Generic Waste Coupling',
              quantity: '5',
              unitOfMeasure: 'pcs',
              unitRate: '45.50',
              discountAmount: '10',
              taxRate: '18'
            },
            // Additional manual line added during review (no parchaRowId)
            {
              productSnapshot: 'Teflon Thread Seal Tape 12mm',
              quantity: '3',
              unitOfMeasure: 'rolls',
              unitRate: '25',
              discountAmount: '0',
              taxRate: '18'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      const estimate = data.estimate;

      // 1. Verify Draft Status & Structure
      expect(estimate.id).toBeDefined();
      expect(estimate.estimateNumber).toMatch(/^EST-\d+/);
      expect(estimate.status).toBe(EstimateStatus.DRAFT);
      expect(estimate.customerId).toBe(activeCustomer.id);
      expect(estimate.creatorId).toBe(staff1User.id);
      expect(estimate.notes).toBe('Customer requested 5% promo discount on coupling');
      expect(estimate.terms).toBe('Standard 7-day estimate validity');

      // 2. Verify Database Relations & Traceability
      const dbEstimate = await prisma.estimate.findUnique({
        where: { id: estimate.id },
        include: { lines: true, parchaJob: true }
      });
      expect(dbEstimate).toBeDefined();
      expect(dbEstimate?.parchaJobId).toBe(reviewedJobStaff1.id);
      expect(dbEstimate?.parchaJob?.originalFilename).toBe('parcha_slip_01.jpg');
      expect(dbEstimate?.lines).toHaveLength(3);

      const dbLine1 = dbEstimate?.lines.find(l => l.parchaRowId === rowEligibleVariant.id);
      expect(dbLine1).toBeDefined();
      expect(dbLine1?.productSnapshot).toBe('Ceramic Basin 18x12');
      expect(dbLine1?.variantId).toBe(activeVariantA1.id);
      expect(dbLine1?.quantity.toString()).toBe('2');
      expect(dbLine1?.unitRate.toString()).toBe('150');

      const dbLine2 = dbEstimate?.lines.find(l => l.parchaRowId === rowEligibleNoVariant.id);
      expect(dbLine2).toBeDefined();
      expect(dbLine2?.productSnapshot).toBe('Generic Waste Coupling');
      expect(dbLine2?.variantId).toBeNull();
      expect(dbLine2?.quantity.toString()).toBe('5');
      expect(dbLine2?.unitRate.toString()).toBe('45.5');

      const dbLineManual = dbEstimate?.lines.find(l => l.parchaRowId === null);
      expect(dbLineManual).toBeDefined();
      expect(dbLineManual?.productSnapshot).toBe('Teflon Thread Seal Tape 12mm');

      // 3. Verify Calculations & Upward Ceiling Rounding (Phase 5 BillingCalculationService)
      expect(dbEstimate?.subtotal.toString()).toBe('603');
      expect(dbEstimate?.discountTotal.toString()).toBe('10');
      expect(dbEstimate?.taxTotal.toString()).toBe('106.74');
      expect(dbEstimate?.grandTotal.toString()).toBe('701');

      // 4. Verify Non-alteration of Source ParchaJob and Rows
      const jobAfter = await prisma.parchaJob.findUnique({
        where: { id: reviewedJobStaff1.id },
        include: { rows: true }
      });
      expect(jobAfter?.status).toBe('REVIEW_REQUIRED'); // Status unchanged
      expect(jobAfter?.rawOcrText).toBe('Handwritten parcha slip content'); // Unchanged
      const row1After = jobAfter?.rows.find(r => r.id === rowEligibleVariant.id);
      expect(row1After?.ocrOriginalText).toBe('2 pc ceramic basin white'); // Text preserved
    });

    it('enforces idempotency via idempotency-key header', async () => {
      mockUser(staff1User);
      const idempotencyKey = 'idem-parcha-draft-12345';
      const payload = {
        customerId: activeCustomer.id,
        issueDate: new Date().toISOString(),
        lines: [
          {
            parchaRowId: rowEligibleVariant.id,
            productSnapshot: 'Ceramic Basin 18x12',
            quantity: '1',
            unitRate: '150',
            discountAmount: '0',
            taxRate: '0'
          }
        ]
      };

      // First Request -> 201 Created
      const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const res1 = await POST(req1, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      expect(data1.replayed).toBeUndefined();

      // Second Request with same idempotency-key -> 200 Replayed
      const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const res2 = await POST(req2, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.replayed).toBe(true);
      expect(data2.estimate.id).toBe(data1.estimate.id);
      expect(data2.estimate.estimateNumber).toBe(data1.estimate.estimateNumber);
    });
  });

  describe('3. Source-Row Integrity & Strict Catalogue Match Verification', () => {
    it('rejects line with mismatched productId that differs from row confirmedProductId', async () => {
      mockUser(staff1User);
      const initialCount = await prisma.estimate.count();

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              productId: productWithoutVariants.id, // Mismatched! row confirmed is activeProductA
              productSnapshot: 'Mismatched product',
              quantity: '1',
              unitRate: '100'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('does not match confirmed product');

      // Verify no partial estimate created
      const finalCount = await prisma.estimate.count();
      expect(finalCount).toBe(initialCount);
    });

    it('rejects line with mismatched variantId that differs from row confirmedVariantId', async () => {
      mockUser(staff1User);
      const initialCount = await prisma.estimate.count();

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA2.id, // Row confirmed is activeVariantA1
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '100'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('does not match confirmed variant');

      const finalCount = await prisma.estimate.count();
      expect(finalCount).toBe(initialCount);
    });

    it('rejects line attempting to attach an unconfirmed variant to a product-only row', async () => {
      mockUser(staff1User);
      const initialCount = await prisma.estimate.count();

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleNoVariant.id, // Confirmed product only, NO confirmed variant
              variantId: activeVariantA1.id, // Illegitimate variant attachment
              productSnapshot: 'Waste coupling with attached variant',
              quantity: '1',
              unitRate: '50'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Cannot attach variant');

      const finalCount = await prisma.estimate.count();
      expect(finalCount).toBe(initialCount);
    });

    it('rejects line referencing an inactive product in catalogue at submission time', async () => {
      mockUser(staff1User);
      // Create a temporary product, confirm a row to it, then deactivate the product
      const tempProd = await CatalogueService.createProduct({
        name: 'Temp Basin to Deactivate',
        categoryId: activeProductA.categoryId,
        isActive: true,
        variants: [{ sku: 'TEMP-VAR-01', sellingPrice: 200, costPrice: 100, isActive: true, attributes: {} }]
      });

      const tempRow = await prisma.parchaJobRow.create({
        data: {
          jobId: reviewedJobStaff1.id,
          ocrOriginalText: '1 temp basin',
          confirmedProductId: tempProd.id,
          confirmedVariantId: tempProd.variants[0]!.id,
          version: 0
        }
      });

      // Deactivate product
      await prisma.product.update({ where: { id: tempProd.id }, data: { isActive: false } });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: tempRow.id,
              variantId: tempProd.variants[0]!.id,
              productSnapshot: 'Temp Basin',
              quantity: '1',
              unitRate: '200'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('invalid or inactive');
    });

    it('rejects line referencing an inactive variant in catalogue at submission time', async () => {
      mockUser(staff1User);
      const tempProd = await CatalogueService.createProduct({
        name: 'Temp Basin Active Prod Inactive Var',
        categoryId: activeProductA.categoryId,
        isActive: true,
        variants: [{ sku: 'TEMP-VAR-INACT', sellingPrice: 200, costPrice: 100, isActive: true, attributes: {} }]
      });

      const tempRow = await prisma.parchaJobRow.create({
        data: {
          jobId: reviewedJobStaff1.id,
          ocrOriginalText: '1 temp basin inact var',
          confirmedProductId: tempProd.id,
          confirmedVariantId: tempProd.variants[0]!.id,
          version: 0
        }
      });

      // Deactivate variant only
      await prisma.productVariant.update({ where: { id: tempProd.variants[0]!.id }, data: { isActive: false } });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: tempRow.id,
              variantId: tempProd.variants[0]!.id,
              productSnapshot: 'Temp Basin',
              quantity: '1',
              unitRate: '200'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('invalid or inactive');
    });

    it('strictly prevents duplicate source-row parchaRowId in a single estimate', async () => {
      mockUser(staff1User);
      const initialCount = await prisma.estimate.count();

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin Split Part 1',
              quantity: '1',
              unitRate: '150'
            },
            {
              parchaRowId: rowEligibleVariant.id, // Duplicate reference to same row!
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin Split Part 2',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Duplicate source row reference');

      const finalCount = await prisma.estimate.count();
      expect(finalCount).toBe(initialCount);
    });

    it('verifies invalid requests create zero partial estimates or lines in database', async () => {
      mockUser(staff1User);
      const estimatesBefore = await prisma.estimate.count();
      const linesBefore = await prisma.estimateLine.count();

      // Submit an invalid request
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Basin',
              quantity: '-5', // Invalid negative quantity
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);

      const estimatesAfter = await prisma.estimate.count();
      const linesAfter = await prisma.estimateLine.count();
      expect(estimatesAfter).toBe(estimatesBefore);
      expect(linesAfter).toBe(linesBefore);
    });
  });

  describe('4. Transaction Boundary & Deterministic Concurrency Protection', () => {
    it('concurrently deactivating a product during draft creation aborts transaction cleanly', async () => {
      mockUser(staff1User);

      // Create a dedicated product and row for this race test
      const raceProd = await CatalogueService.createProduct({
        name: 'Concurrent Race Basin',
        categoryId: activeProductA.categoryId,
        isActive: true,
        variants: [{ sku: 'RACE-BASIN-01', sellingPrice: 300, costPrice: 150, isActive: true, attributes: {} }]
      });

      const raceRow = await prisma.parchaJobRow.create({
        data: {
          jobId: reviewedJobStaff1.id,
          ocrOriginalText: '1 race basin',
          confirmedProductId: raceProd.id,
          confirmedVariantId: raceProd.variants[0]!.id,
          version: 0
        }
      });

      // Hook fires after ParchaJob lock, before catalogue validation
      __setEstimateTestHook(async (stage: string) => {
        if (stage === 'after-job-lock') {
          // Concurrent transaction deactivates the product
          await prisma.product.update({
            where: { id: raceProd.id },
            data: { isActive: false }
          });
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: raceRow.id,
              variantId: raceProd.variants[0]!.id,
              productSnapshot: 'Concurrent Race Basin',
              quantity: '1',
              unitRate: '300'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('is invalid or inactive');

      // Verify no estimate was persisted
      const createdEst = await prisma.estimate.findFirst({
        where: { lines: { some: { parchaRowId: raceRow.id } } }
      });
      expect(createdEst).toBeNull();
    });

    it('concurrent transition away from REVIEW_REQUIRED prevents draft creation from stale state', async () => {
      mockUser(staff1User);

      // Dedicated job for status race
      const raceJob = await prisma.parchaJob.create({
        data: {
          id: `job-status-race-${Date.now()}`,
          uploaderId: staff1User.id,
          originalFilename: 'race_parcha.jpg',
          storageKey: `race_key_${Date.now()}`,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          status: 'REVIEW_REQUIRED',
          processingToken: 'tok_race'
        }
      });

      const raceJobRow = await prisma.parchaJobRow.create({
        data: {
          jobId: raceJob.id,
          ocrOriginalText: '1 basin',
          confirmedProductId: activeProductA.id,
          confirmedVariantId: activeVariantA1.id,
          version: 0
        }
      });

      // Transition the job to PROCESSING before creation begins
      await prisma.parchaJob.update({
        where: { id: raceJob.id },
        data: { status: 'PROCESSING' }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${raceJob.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: raceJobRow.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: raceJob.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Job must be reviewed first');
    });

    it('concurrently deactivating a variant during draft creation aborts transaction cleanly', async () => {
      mockUser(staff1User);

      const varProd = await CatalogueService.createProduct({
        name: 'Race Variant Basin',
        categoryId: activeProductA.categoryId,
        isActive: true,
        variants: [{ sku: 'RACE-VAR-99', sellingPrice: 250, costPrice: 120, isActive: true, attributes: {} }]
      });

      const varRow = await prisma.parchaJobRow.create({
        data: {
          jobId: reviewedJobStaff1.id,
          ocrOriginalText: '1 race variant basin',
          confirmedProductId: varProd.id,
          confirmedVariantId: varProd.variants[0]!.id,
          version: 0
        }
      });

      __setEstimateTestHook(async (stage: string) => {
        if (stage === 'after-job-lock') {
          // Deactivate variant before catalogue locks are acquired
          await prisma.productVariant.update({
            where: { id: varProd.variants[0]!.id },
            data: { isActive: false }
          });
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: varRow.id,
              variantId: varProd.variants[0]!.id,
              productSnapshot: 'Race Variant Basin',
              quantity: '1',
              unitRate: '250'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('is invalid or inactive');
    });

    it('concurrent extraction PATCH and estimate POST adhere to global lock hierarchy without deadlocking', async () => {
      mockUser(staff1User);

      // Dedicated job for lock order test
      const sharedJob = await prisma.parchaJob.create({
        data: {
          id: `job-lock-order-${Date.now()}`,
          uploaderId: staff1User.id,
          originalFilename: 'lock_order_parcha.jpg',
          storageKey: `key_lock_order_${Date.now()}`,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          status: 'REVIEW_REQUIRED',
          processingToken: 'tok_lock_order'
        }
      });

      const sharedRow = await prisma.parchaJobRow.create({
        data: {
          jobId: sharedJob.id,
          ocrOriginalText: '1 shared basin',
          confirmedProductId: activeProductA.id,
          confirmedVariantId: activeVariantA1.id,
          version: 0
        }
      });

      const extReq = new NextRequest(`http://localhost/api/v1/parcha-jobs/${sharedJob.id}/extraction`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{
            id: sharedRow.id,
            revisedDescription: 'Updated concurrently',
            confirmedProductId: activeProductA.id,
            confirmedVariantId: activeVariantA1.id,
            version: 0
          }]
        })
      });

      const estReq = new NextRequest(`http://localhost/api/v1/parcha-jobs/${sharedJob.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: sharedRow.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Shared Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });

      // Execute both concurrently via Promise.all
      const [estRes, extRes] = await Promise.all([
        POST(estReq, { params: Promise.resolve({ id: sharedJob.id }) }),
        extractionPATCH(extReq, { params: Promise.resolve({ id: sharedJob.id }) })
      ]);

      // Both serialize cleanly without deadlock (no 500 internal errors)
      expect([200, 201]).toContain(estRes.status);
      expect([200, 409]).toContain(extRes.status);
    });

    it('customer deactivation obtaining protection first prevents estimate creation', async () => {
      mockUser(staff1User);

      const raceCust = await CustomerService.createCustomer({
        name: 'Race Cust Pre-Lock',
        phoneNumber: '9876543210',
        isActive: true
      });

      const estimatesBefore = await prisma.estimate.count();
      const linesBefore = await prisma.estimateLine.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'ESTIMATE' } });

      __setEstimateTestHook(async (stage: string) => {
        if (stage === 'before-customer-lock') {
          // Concurrent transaction archives the customer before customer lock is acquired
          await CustomerService.archiveCustomer(raceCust.id);
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: raceCust.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Selected customer is invalid or inactive');

      const estimatesAfter = await prisma.estimate.count();
      const linesAfter = await prisma.estimateLine.count();
      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'ESTIMATE' } });

      expect(estimatesAfter).toBe(estimatesBefore);
      expect(linesAfter).toBe(linesBefore);
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);

      const custInDb = await CustomerService.getCustomer(raceCust.id);
      expect(custInDb.isActive).toBe(false);
    });

    it('estimate transaction obtaining customer lock first ensures active-state consistency through commit', async () => {
      mockUser(staff1User);

      const raceCust = await CustomerService.createCustomer({
        name: 'Race Cust Post-Lock',
        phoneNumber: '9876543211',
        isActive: true
      });

      let archivePromise: Promise<any> | null = null;
      let archiveFinished = false;

      __setEstimateTestHook(async (stage: string) => {
        if (stage === 'after-customer-lock') {
          // Attempt concurrent customer deactivation while estimate holds FOR SHARE lock
          archivePromise = CustomerService.archiveCustomer(raceCust.id).then((res) => {
            archiveFinished = true;
            return res;
          });
          // Wait briefly to prove that archive is blocked by PostgreSQL row lock manager
          await new Promise((r) => setTimeout(r, 60));
          expect(archiveFinished).toBe(false);
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: raceCust.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.estimate.customerId).toBe(raceCust.id);

      // Now that estimate transaction committed, the lock was released and archive should complete
      expect(archivePromise).not.toBeNull();
      await archivePromise;
      expect(archiveFinished).toBe(true);

      const custInDb = await CustomerService.getCustomer(raceCust.id);
      expect(custInDb.isActive).toBe(false);
    });

    it('concurrent customer deactivation and estimate creation via Promise.all serialize cleanly without deadlock', async () => {
      mockUser(staff1User);

      const raceCust = await CustomerService.createCustomer({
        name: 'Race Cust Promise All',
        phoneNumber: '9876543212',
        isActive: true
      });

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: raceCust.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: rowEligibleVariant.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });

      // Fire both concurrently
      const [estRes, archRes] = await Promise.all([
        POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) }),
        CustomerService.archiveCustomer(raceCust.id)
      ]);

      // Estimate either acquired lock first (201) or archive acquired first (400)
      expect([201, 400]).toContain(estRes.status);
      expect(archRes.isActive).toBe(false);

      if (estRes.status === 201) {
        const data = await estRes.json();
        expect(data.estimate.customerId).toBe(raceCust.id);
      } else {
        const data = await estRes.json();
        expect(data.error).toContain('Selected customer is invalid or inactive');
      }

      const custInDb = await CustomerService.getCustomer(raceCust.id);
      expect(custInDb.isActive).toBe(false);
    });
  });

  describe('5. Pricing and Calculation Audit (Phase 5 Upward Ceiling Compliance)', () => {
    it('handles fractional quantity and rate combinations with exact ceiling rounding', async () => {
      mockUser(staff1User);
      // qty: 2.5, rate: 33.33, taxRate: 18%
      // subtotal = ceil(2.5 * 33.33) = ceil(83.325) = 84
      // taxAmount = 84 * 18 / 100 = 15.12
      // lineAmount = ceil(84 + 15.12) = ceil(99.12) = 100
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              productSnapshot: 'PVC Flexible Pipe (Meters)',
              quantity: '2.5',
              unitOfMeasure: 'mtr',
              unitRate: '33.33',
              discountAmount: '0',
              taxRate: '18'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      const est = data.estimate;

      expect(est.subtotal).toBe('84');
      expect(est.discountTotal).toBe('0');
      expect(est.taxTotal).toBe('15.12');
      expect(est.grandTotal).toBe('100');

      const dbEst = await prisma.estimate.findUnique({
        where: { id: est.id },
        include: { lines: true }
      });
      expect(dbEst?.subtotal.toString()).toBe('84');
      expect(dbEst?.taxTotal.toString()).toBe('15.12');
      expect(dbEst?.grandTotal.toString()).toBe('100');
      expect(dbEst?.lines[0]!.lineAmount.toString()).toBe('100');
    });

    it('accurately applies upward ceiling rounding across whole-rupee boundary values', async () => {
      mockUser(staff1User);
      // Line 1: Immediately below boundary: 1 * 99.01 -> subtotal ceil = 100, lineAmount = 100
      // Line 2: Exactly at boundary: 1 * 100.00 -> subtotal ceil = 100, lineAmount = 100
      // Line 3: Immediately above boundary: 1 * 100.01 -> subtotal ceil = 101, lineAmount = 101
      // Line 4: Zero rate: 5 * 0 -> subtotal = 0, lineAmount = 0
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            { productSnapshot: 'Item Below Boundary', quantity: '1', unitRate: '99.01', taxRate: '0', discountAmount: '0' },
            { productSnapshot: 'Item At Boundary', quantity: '1', unitRate: '100.00', taxRate: '0', discountAmount: '0' },
            { productSnapshot: 'Item Above Boundary', quantity: '1', unitRate: '100.01', taxRate: '0', discountAmount: '0' },
            { productSnapshot: 'Zero Rate Item', quantity: '5', unitRate: '0', taxRate: '0', discountAmount: '0' }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      const est = data.estimate;

      // Subtotal = 100 + 100 + 101 + 0 = 301
      expect(est.subtotal).toBe('301');
      expect(est.grandTotal).toBe('301');

      const dbEst = await prisma.estimate.findUnique({
        where: { id: est.id },
        include: { lines: { orderBy: { sortOrder: 'asc' } } }
      });
      expect(dbEst?.lines[0]!.subtotal.toString()).toBe('100');
      expect(dbEst?.lines[1]!.subtotal.toString()).toBe('100');
      expect(dbEst?.lines[2]!.subtotal.toString()).toBe('101');
      expect(dbEst?.lines[3]!.subtotal.toString()).toBe('0');
    });

    it('accurately calculates discount combined with tax and verifies exact agreement with BillingCalculationService', async () => {
      mockUser(staff1User);
      // qty: 2, rate: 100.00, discount: 20.00, taxRate: 18%
      // subtotal = ceil(2 * 100) = 200
      // taxableAmount = 200 - 20 = 180
      // taxAmount = 180 * 18 / 100 = 32.40
      // lineAmount = ceil(180 + 32.40) = 213
      const calcExpected = BillingCalculationService.calculateLine({
        quantity: '2',
        unitRate: '100',
        discountAmount: '20',
        taxRate: '18'
      });
      const totalsExpected = BillingCalculationService.calculateTotals([calcExpected]);

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              productSnapshot: 'Premium Brass Tap',
              quantity: '2',
              unitRate: '100',
              discountAmount: '20',
              taxRate: '18'
            }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const est = (await res.json()).estimate;

      expect(est.subtotal).toBe(totalsExpected.subtotal.toString());
      expect(est.discountTotal).toBe(totalsExpected.discountTotal.toString());
      expect(est.taxTotal).toBe(totalsExpected.taxTotal.toString());
      expect(est.grandTotal).toBe(totalsExpected.grandTotal.toString());

      const dbEst = await prisma.estimate.findUnique({
        where: { id: est.id },
        include: { lines: true }
      });
      expect(dbEst?.subtotal.toString()).toBe(totalsExpected.subtotal.toString());
      expect(dbEst?.discountTotal.toString()).toBe(totalsExpected.discountTotal.toString());
      expect(dbEst?.taxTotal.toString()).toBe(totalsExpected.taxTotal.toString());
      expect(dbEst?.grandTotal.toString()).toBe(totalsExpected.grandTotal.toString());
      expect(dbEst?.lines[0]!.taxAmount.toString()).toBe(calcExpected.taxAmount.toString());
      expect(dbEst?.lines[0]!.lineAmount.toString()).toBe(calcExpected.lineAmount.toString());
    });

    it('verifies decimal-safe calculation across fractional rates and zero discount/tax combinations', async () => {
      mockUser(staff1User);
      // Line 1: Fractional qty and rate: 1.333 * 29.99 = 39.97667 -> subtotal ceil = 40, tax 12% on 40 = 4.80, lineAmount ceil(44.80) = 45
      // Line 2: Zero discount and zero tax: 3 * 15.50 = 46.50 -> subtotal ceil = 47, lineAmount = 47
      const calc1 = BillingCalculationService.calculateLine({ quantity: '1.333', unitRate: '29.99', discountAmount: '0', taxRate: '12' });
      const calc2 = BillingCalculationService.calculateLine({ quantity: '3', unitRate: '15.50', discountAmount: '0', taxRate: '0' });
      const expectedTotals = BillingCalculationService.calculateTotals([calc1, calc2]);

      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            { productSnapshot: 'Fractional Item 1', quantity: '1.333', unitRate: '29.99', discountAmount: '0', taxRate: '12' },
            { productSnapshot: 'Fractional Item 2', quantity: '3', unitRate: '15.50', discountAmount: '0', taxRate: '0' }
          ]
        })
      });

      const res = await POST(req, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res.status).toBe(201);
      const est = (await res.json()).estimate;

      expect(est.subtotal).toBe(expectedTotals.subtotal.toString());
      expect(est.grandTotal).toBe(expectedTotals.grandTotal.toString());

      const dbEst = await prisma.estimate.findUnique({
        where: { id: est.id },
        include: { lines: { orderBy: { sortOrder: 'asc' } } }
      });
      expect(dbEst?.lines[0]!.lineAmount.toString()).toBe(calc1.lineAmount.toString());
      expect(dbEst?.lines[1]!.lineAmount.toString()).toBe(calc2.lineAmount.toString());
    });
  });

  describe('6. Concurrent Idempotency & Conflict Scoping', () => {
    it('simultaneous concurrent POST requests with identical idempotency-key create exactly ONE estimate', async () => {
      mockUser(staff1User);
      const concurrentKey = `idem-concurrent-key-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const payload = {
        customerId: activeCustomer.id,
        issueDate: new Date().toISOString(),
        lines: [
          {
            parchaRowId: rowEligibleVariant.id,
            variantId: activeVariantA1.id,
            productSnapshot: 'Ceramic Basin 18x12',
            quantity: '1',
            unitRate: '150',
            discountAmount: '0',
            taxRate: '0'
          }
        ]
      };

      const makeReq = () => new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': concurrentKey
        },
        body: JSON.stringify(payload)
      });

      // Execute both concurrently
      const [resA, resB] = await Promise.all([
        POST(makeReq(), { params: Promise.resolve({ id: reviewedJobStaff1.id }) }),
        POST(makeReq(), { params: Promise.resolve({ id: reviewedJobStaff1.id }) })
      ]);

      // Both should succeed (one 201, one 200, or both successful)
      expect([200, 201]).toContain(resA.status);
      expect([200, 201]).toContain(resB.status);

      const dataA = await resA.json();
      const dataB = await resB.json();

      // Assert both returned the exact same estimate
      expect(dataA.estimate.id).toBe(dataB.estimate.id);
      expect(dataA.estimate.estimateNumber).toBe(dataB.estimate.estimateNumber);

      // Verify database uniqueness: exactly ONE estimate with this key
      const count = await prisma.estimate.count({ where: { idempotencyKey: concurrentKey } });
      expect(count).toBe(1);
    });

    it('reusing same idempotency-key with materially different payload returns 409 Conflict', async () => {
      mockUser(staff1User);
      const conflictKey = `idem-conflict-key-${Date.now()}`;

      // Request 1: Active Customer A
      const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': conflictKey
        },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '1', unitRate: '100' }]
        })
      });
      const res1 = await POST(req1, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res1.status).toBe(201);

      // Request 2: Reusing SAME key on a different customer or job
      const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': conflictKey
        },
        body: JSON.stringify({
          customerId: null, // Material difference: no customer!
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '1', unitRate: '100' }]
        })
      });
      const res2 = await POST(req2, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res2.status).toBe(409);
      const data2 = await res2.json();
      expect(data2.error).toContain('Idempotency key already used for a different estimate payload');
    });

    it('failed transaction does not lock or poison idempotency-key for subsequent retry', async () => {
      mockUser(staff1User);
      const retryKey = `idem-retry-after-fail-${Date.now()}`;

      // 1. Send invalid request with retryKey (negative quantity)
      const failReq = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': retryKey
        },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '-10', unitRate: '100' }]
        })
      });
      const failRes = await POST(failReq, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(failRes.status).toBe(400);

      // Verify no estimate with this key was saved
      const existing = await prisma.estimate.findUnique({ where: { idempotencyKey: retryKey } });
      expect(existing).toBeNull();

      // 2. Retry with valid payload using the EXACT SAME key
      const successReq = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': retryKey
        },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '2', unitRate: '100' }]
        })
      });
      const successRes = await POST(successReq, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(successRes.status).toBe(201);
      const successData = await successRes.json();
      expect(successData.estimate.id).toBeDefined();
    });

    it('reusing same idempotency-key with changed line item details returns 409 Conflict', async () => {
      mockUser(staff1User);
      const testKey = `idem-payload-line-diff-${Date.now()}`;

      // 1. Initial creation
      const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': testKey
        },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Standard Basin', quantity: '2', unitRate: '100', discountAmount: '0', taxRate: '0' }]
        })
      });
      const res1 = await POST(req1, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res1.status).toBe(201);

      // 2. Replay with changed quantity (2 -> 3)
      const reqDiffQty = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': testKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Standard Basin', quantity: '3', unitRate: '100', discountAmount: '0', taxRate: '0' }]
        })
      });
      const resDiffQty = await POST(reqDiffQty, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(resDiffQty.status).toBe(409);
      expect((await resDiffQty.json()).error).toContain('Idempotency key already used for a different estimate payload');

      // 3. Replay with changed unitRate (100 -> 110)
      const reqDiffRate = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': testKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Standard Basin', quantity: '2', unitRate: '110', discountAmount: '0', taxRate: '0' }]
        })
      });
      const resDiffRate = await POST(reqDiffRate, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(resDiffRate.status).toBe(409);

      // 4. Replay with changed taxRate (0 -> 18)
      const reqDiffTax = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': testKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Standard Basin', quantity: '2', unitRate: '100', discountAmount: '0', taxRate: '18' }]
        })
      });
      const resDiffTax = await POST(reqDiffTax, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(resDiffTax.status).toBe(409);

      // 5. Replay with extra line item
      const reqExtraLine = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': testKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            { productSnapshot: 'Standard Basin', quantity: '2', unitRate: '100', discountAmount: '0', taxRate: '0' },
            { productSnapshot: 'Additional Coupling', quantity: '1', unitRate: '50', discountAmount: '0', taxRate: '0' }
          ]
        })
      });
      const resExtraLine = await POST(reqExtraLine, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(resExtraLine.status).toBe(409);
    });

    it('sequential replay with exact semantically equivalent payload returns 200 with replayed: true', async () => {
      mockUser(staff1User);
      const replayKey = `idem-replay-exact-${Date.now()}`;
      const payload = {
        customerId: activeCustomer.id,
        issueDate: new Date().toISOString(),
        notes: 'Handle with care',
        terms: 'Standard warranty',
        lines: [{ productSnapshot: 'Basin', quantity: '1', unitRate: '150', discountAmount: '0', taxRate: '0' }]
      };

      // First call (201 Created)
      const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': replayKey },
        body: JSON.stringify(payload)
      });
      const res1 = await POST(req1, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res1.status).toBe(201);
      const data1 = await res1.json();

      // Sequential replay with exact payload (decimal string variation "150.00" vs "150")
      const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': replayKey },
        body: JSON.stringify({
          ...payload,
          lines: [{ productSnapshot: 'Basin', quantity: '1.000', unitRate: '150.00', discountAmount: '0.00', taxRate: '0.00' }]
        })
      });
      const res2 = await POST(req2, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.replayed).toBe(true);
      expect(data2.estimate.id).toBe(data1.estimate.id);
      expect(data2.estimate.estimateNumber).toBe(data1.estimate.estimateNumber);
    });

    it('reusing idempotency-key across different actors returns 403 Forbidden', async () => {
      // 1. Staff 1 creates estimate with Key-Actor
      mockUser(staff1User);
      const actorKey = `idem-cross-actor-${Date.now()}`;
      const req1 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': actorKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '1', unitRate: '150' }]
        })
      });
      const res1 = await POST(req1, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
      expect(res1.status).toBe(201);

      // 2. Staff 2 attempts to reuse or replay Key-Actor
      mockUser(staff2User);
      const req2 = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff2.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': actorKey },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [{ productSnapshot: 'Basin', quantity: '1', unitRate: '150' }]
        })
      });
      const res2 = await POST(req2, { params: Promise.resolve({ id: reviewedJobStaff2.id }) });
      expect(res2.status).toBe(403);
      const data2 = await res2.json();
      expect(data2.error).toBe('Forbidden');
    });
  });

  describe('7. Traceability and Deletion Semantics', () => {
    it('physical deletion of source ParchaJob sets parchaJobId and parchaRowId to null without destroying Estimate', async () => {
      mockUser(staff1User);

      // Create a temporary job and row
      const tempJob = await prisma.parchaJob.create({
        data: {
          id: `job-deletion-test-${Date.now()}`,
          uploaderId: staff1User.id,
          originalFilename: 'temp_to_delete.jpg',
          storageKey: `key_del_${Date.now()}`,
          mimeType: 'image/jpeg',
          sizeBytes: 500,
          status: 'REVIEW_REQUIRED',
          processingToken: 'tok_del'
        }
      });

      const tempRow = await prisma.parchaJobRow.create({
        data: {
          jobId: tempJob.id,
          ocrOriginalText: '1 basin to delete',
          confirmedProductId: activeProductA.id,
          confirmedVariantId: activeVariantA1.id,
          version: 0
        }
      });

      // Create estimate draft from this job
      const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${tempJob.id}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCustomer.id,
          issueDate: new Date().toISOString(),
          lines: [
            {
              parchaRowId: tempRow.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Ceramic Basin 18x12',
              quantity: '1',
              unitRate: '150'
            }
          ]
        })
      });
      const res = await POST(req, { params: Promise.resolve({ id: tempJob.id }) });
      expect(res.status).toBe(201);
      const estId = (await res.json()).estimate.id;

      // Assert estimate initially has the job and row links
      const estBefore = await prisma.estimate.findUnique({
        where: { id: estId },
        include: { lines: true }
      });
      expect(estBefore?.parchaJobId).toBe(tempJob.id);
      expect(estBefore?.lines[0]!.parchaRowId).toBe(tempRow.id);

      // Physically delete the source ParchaJob (cascades deletion to ParchaJobRow)
      await prisma.parchaJob.delete({ where: { id: tempJob.id } });

      // Verify the estimate and its lines are STILL INTACT, but relations are safely set to null
      const estAfter = await prisma.estimate.findUnique({
        where: { id: estId },
        include: { lines: true }
      });
      expect(estAfter).toBeDefined();
      expect(estAfter?.parchaJobId).toBeNull(); // ON DELETE SET NULL
      expect(estAfter?.lines[0]!.parchaRowId).toBeNull(); // ON DELETE SET NULL
      expect(estAfter?.lines[0]!.productSnapshot).toBe('Ceramic Basin 18x12');
      expect(estAfter?.lines[0]!.unitRate.toString()).toBe('150');
      expect(estAfter?.grandTotal.toString()).toBe('150');
    });
  });
});
