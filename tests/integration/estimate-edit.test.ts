/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db/client';
import { GET as getEstimateRoute, PATCH as patchEstimateRoute } from '../../src/app/api/v1/estimates/[id]/route';
import { POST as postEstimateStatusRoute } from '../../src/app/api/v1/estimates/[id]/status/route';
import { POST as createParchaEstimateRoute } from '../../src/app/api/v1/parcha-jobs/[id]/estimate/route';
import { EstimateService, __setEstimateUpdateTestHook } from '../../src/features/billing/estimate.service';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';
import { CustomerService } from '../../src/features/billing/customer.service';
import * as authGuard from '../../src/features/auth/auth.guard';
import { EstimateStatus } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Persisted Estimate Review & Editing Integration (Phase 6.3.3.2)', () => {
  let ownerUser: any;
  let staff1User: any;
  let staff2User: any;

  let activeCustomer: any;
  let anotherActiveCustomer: any;
  let inactiveCustomer: any;

  let activeProductA: any;
  let activeVariantA1: any;
  let activeVariantA2: any;

  let reviewedJobStaff1: any;
  let parchaRowA: any;
  let parchaRowB: any;

  let persistedParchaEstimate: any;
  let persistedManualEstimate: any;

  beforeAll(async () => {
    // Default mock auth
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      return { id: 'user-owner', role: 'OWNER', email: 'owner@test.com', name: 'Owner', isActive: true } as any;
    });

    // Clean up
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
      name: 'Sharma Sanitary Store',
      phoneNumber: '9811122233',
      isActive: true
    });
    anotherActiveCustomer = await CustomerService.createCustomer({
      name: 'Verma Plumbers',
      phoneNumber: '9822233344',
      isActive: true
    });
    inactiveCustomer = await CustomerService.createCustomer({
      name: 'Old Closed Shop',
      phoneNumber: '9800011122',
      isActive: false
    });

    // 3. Create Catalogue
    const category = await CatalogueService.createCategory({ name: 'Bathroom Fixtures', isActive: true });
    activeProductA = await CatalogueService.createProduct({
      name: 'Wall Hung Closet',
      categoryId: category.id,
      isActive: true,
      variants: [
        { sku: 'CLOSET-WHT-01', sellingPrice: 4500, costPrice: 2800, isActive: true, attributes: { color: 'White' } },
        { sku: 'CLOSET-BLK-02', sellingPrice: 5500, costPrice: 3500, isActive: true, attributes: { color: 'Black' } }
      ]
    });
    activeVariantA1 = activeProductA.variants[0];
    activeVariantA2 = activeProductA.variants[1];

    // 4. Create Parcha Job & Rows
    reviewedJobStaff1 = await prisma.parchaJob.create({
      data: {
        id: 'job-reviewed-staff1-p6332',
        uploaderId: staff1User.id,
        originalFilename: 'parcha_bath_renovation.jpg',
        storageKey: 'key_parcha_p6332',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        status: 'REVIEW_REQUIRED',
        rawOcrText: '1 wall closet, 2 faucets',
        processingToken: 'tok_p6332'
      }
    });

    parchaRowA = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 0,
        ocrOriginalText: '1 wall closet wht',
        confirmedProductId: activeProductA.id,
        confirmedVariantId: activeVariantA1.id,
        revisedQuantity: '2',
        revisedUnit: 'pcs',
        version: 0
      }
    });

    parchaRowB = await prisma.parchaJobRow.create({
      data: {
        jobId: reviewedJobStaff1.id,
        sortOrder: 1,
        ocrOriginalText: '1 closet blk',
        confirmedProductId: activeProductA.id,
        confirmedVariantId: activeVariantA2.id,
        revisedQuantity: '1',
        revisedUnit: 'pcs',
        version: 0
      }
    });

    // 5. Create Baseline Estimates for Editing
    // Estimate 1: Created from Parcha Job by Staff 1
    mockUser(staff1User);
    const parchaReq = new NextRequest(`http://localhost/api/v1/parcha-jobs/${reviewedJobStaff1.id}/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'idempotency-key': 'init-parcha-est-p6332' },
      body: JSON.stringify({
        customerId: activeCustomer.id,
        issueDate: new Date().toISOString(),
        notes: 'Original estimate notes',
        terms: '7 days validity',
        lines: [
          {
            parchaRowId: parchaRowA.id,
            variantId: activeVariantA1.id,
            productSnapshot: 'Wall Hung Closet',
            variantSnapshot: 'CLOSET-WHT-01',
            quantity: '2',
            unitOfMeasure: 'pcs',
            unitRate: '4500',
            discountAmount: '500',
            taxRate: '18'
          },
          {
            parchaRowId: parchaRowB.id,
            variantId: activeVariantA2.id,
            productSnapshot: 'Wall Hung Closet',
            variantSnapshot: 'CLOSET-BLK-02',
            quantity: '1',
            unitOfMeasure: 'pcs',
            unitRate: '5500',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      })
    });
    const parchaRes = await createParchaEstimateRoute(parchaReq, { params: Promise.resolve({ id: reviewedJobStaff1.id }) });
    expect(parchaRes.status).toBe(201);
    persistedParchaEstimate = (await parchaRes.json()).estimate;

    // Estimate 2: Pure Manual Estimate created by Staff 1
    persistedManualEstimate = await EstimateService.createEstimate({
      customerId: activeCustomer.id,
      creatorId: staff1User.id,
      issueDate: new Date(),
      notes: 'Direct counter estimate',
      lines: [
        {
          productSnapshot: 'PVC Connection Pipe 18 inch',
          quantity: '5',
          unitOfMeasure: 'pcs',
          unitRate: '80',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    __setEstimateUpdateTestHook(null);
  });

  afterEach(() => {
    __setEstimateUpdateTestHook(null);
  });

  const mockUser = (user: any, throws?: 'unauth' | 'forbidden') => {
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      if (throws === 'unauth') throw new Error('Unauthorized');
      if (throws === 'forbidden') throw new Error('Forbidden');
      return user;
    });
  };

  describe('1. Estimate Review & Authorization Workflow', () => {
    it('allows OWNER to retrieve persisted draft with lines, customer, and parchaJob relation', async () => {
      mockUser(ownerUser);
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`);
      const res = await getEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      const est = json.data.estimate;
      expect(est.id).toBe(persistedParchaEstimate.id);
      expect(est.estimateNumber).toBe(persistedParchaEstimate.estimateNumber);
      expect(est.status).toBe(EstimateStatus.DRAFT);
      expect(est.version).toBe(0);
      expect(est.createdAt).toBeDefined();
      expect(est.updatedAt).toBeDefined();
      expect(est.customer.id).toBe(activeCustomer.id);
      expect(est.parchaJobId).toBe(reviewedJobStaff1.id);
      expect(est.parchaJob.id).toBe(reviewedJobStaff1.id);
      expect(est.parchaJob.originalFilename).toBe('parcha_bath_renovation.jpg');

      expect(est.lines).toHaveLength(2);
      expect(est.lines[0].parchaRowId).toBe(parchaRowA.id);
      expect(est.lines[1].parchaRowId).toBe(parchaRowB.id);
      expect(est.lines[0].costPrice).toBeUndefined();
    });

    it('allows creator STAFF to retrieve their own persisted draft', async () => {
      mockUser(staff1User);
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`);
      const res = await getEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.estimate.id).toBe(persistedParchaEstimate.id);
    });

    it('forbids other STAFF from retrieving another users restricted estimate (403 Forbidden)', async () => {
      mockUser(staff2User); // Staff 2 is NOT creator and NOT owner
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`);
      const res = await getEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN');
      expect(json.error.message).toContain('permission');
    });

    it('forbids other STAFF from editing another users restricted estimate (403 Forbidden)', async () => {
      mockUser(staff2User);
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Unauthorized edit attempt'
        })
      });
      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 if requested estimate does not exist', async () => {
      mockUser(ownerUser);
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const req = new NextRequest(`http://localhost/api/v1/estimates/${fakeId}`);
      const res = await getEstimateRoute(req, { params: Promise.resolve({ id: fakeId }) });
      expect(res.status).toBe(404);
    });
  });

  describe('2. Editing & Validation Capabilities', () => {
    it('successfully updates permitted fields (quantity, rate, discount, tax, notes, terms) and increments version', async () => {
      mockUser(staff1User);

      // Load initial state
      const initial = await EstimateService.getEstimate(persistedParchaEstimate.id);
      expect(initial.version).toBe(0);

      const newIssueDate = new Date('2026-10-10').toISOString();
      const newValidDate = new Date('2026-10-25').toISOString();

      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          issueDate: newIssueDate,
          validityDate: newValidDate,
          notes: 'Customer accepted special festival pricing',
          terms: 'Payment strictly on delivery',
          lines: [
            {
              parchaRowId: parchaRowA.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Wall Hung Closet',
              variantSnapshot: 'CLOSET-WHT-01',
              quantity: '3', // Edited from 2 to 3
              unitOfMeasure: 'pcs',
              unitRate: '4200', // Edited rate from 4500 to 4200
              discountAmount: '200', // Edited discount
              taxRate: '18'
            },
            {
              parchaRowId: parchaRowB.id,
              variantId: activeVariantA2.id,
              productSnapshot: 'Wall Hung Closet',
              variantSnapshot: 'CLOSET-BLK-02',
              quantity: '2', // Edited from 1 to 2
              unitOfMeasure: 'pcs',
              unitRate: '5500',
              discountAmount: '100',
              taxRate: '18'
            }
          ]
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      const updated = json.data.estimate;

      // 1. Verify updated version and audit fields
      expect(updated.version).toBe(1);
      expect(updated.notes).toBe('Customer accepted special festival pricing');
      expect(updated.terms).toBe('Payment strictly on delivery');

      // 2. Verify parcha lineage preserved
      expect(updated.parchaJobId).toBe(reviewedJobStaff1.id);
      expect(updated.lines).toHaveLength(2);
      expect(updated.lines[0].parchaRowId).toBe(parchaRowA.id);
      expect(updated.lines[1].parchaRowId).toBe(parchaRowB.id);
      expect(updated.lines[0].quantity).toBe('3');
      expect(updated.lines[0].unitRate).toBe('4200');

      // 3. Verify server-authoritative calculations
      // Line 1: qty 3 * 4200 = 12600. discount: 200. taxable: 12400. tax 18%: 2232. lineTotal: 14632.
      // Line 2: qty 2 * 5500 = 11000. discount: 100. taxable: 10900. tax 18%: 1962. lineTotal: 12862.
      // Subtotal: 12600 + 11000 = 23600. DiscountTotal: 300. TaxTotal: 4194. GrandTotal: 27494.
      expect(updated.subtotal).toBe('23600');
      expect(updated.discountTotal).toBe('300');
      expect(updated.taxTotal).toBe('4194');
      expect(updated.grandTotal).toBe('27494');
    });

    it('rejects client-submitted fake totals and enforces server calculation as authoritative', async () => {
      mockUser(staff1User);

      // Attempt to tamper with subtotal and grandTotal to ₹1
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1, // current version after previous test
          subtotal: '1',
          discountTotal: '0',
          taxTotal: '0',
          grandTotal: '1',
          lines: [
            {
              parchaRowId: parchaRowA.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Wall Hung Closet',
              quantity: '1',
              unitRate: '1000',
              discountAmount: '0',
              taxRate: '0',
              lineAmount: '1' // Client attempt to override lineAmount
            }
          ]
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      const updated = json.data.estimate;

      // Server recalculation strictly overrides client forgery: 1 * 1000 = 1000, not 1
      expect(updated.subtotal).toBe('1000');
      expect(updated.grandTotal).toBe('1000');
      expect(updated.lines[0].lineAmount).toBe('1000');
    });

    it('strictly forbids modifying product or variant on a parcha-confirmed row', async () => {
      mockUser(staff1User);

      // 1. Attempt to change variant on parcha-confirmed line A
      const reqVariantChange = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          lines: [
            {
              parchaRowId: parchaRowA.id,
              variantId: activeVariantA2.id, // Swapping variant A1 -> A2
              productSnapshot: 'Wall Hung Closet',
              quantity: '1',
              unitRate: '4500'
            }
          ]
        })
      });
      const resVar = await patchEstimateRoute(reqVariantChange, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(resVar.status).toBe(400);
      const jsonVar = await resVar.json();
      expect(jsonVar.error.message).toContain('Cannot modify product or variant of a parcha-confirmed line');

      // 2. Attempt to change product description on parcha-confirmed line A
      const reqProductChange = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          lines: [
            {
              parchaRowId: parchaRowA.id,
              variantId: activeVariantA1.id,
              productSnapshot: 'Completely Different Jacuzzi Tub', // Modifying product
              quantity: '1',
              unitRate: '4500'
            }
          ]
        })
      });
      const resProd = await patchEstimateRoute(reqProductChange, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(resProd.status).toBe(400);
      const jsonProd = await resProd.json();
      expect(jsonProd.error.message).toContain('Cannot modify product or variant of a parcha-confirmed line');
    });

    it('strictly rejects attaching an unconfirmed or external parchaRowId during estimate edit', async () => {
      mockUser(staff1User);

      // Create an unconfirmed row or row from another job
      const fakeRowId = '00000000-0000-0000-0000-000000000000';
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          lines: [
            {
              parchaRowId: fakeRowId,
              productSnapshot: 'Illegal attached line',
              quantity: '1',
              unitRate: '100'
            }
          ]
        })
      });
      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.message).toContain('Cannot attach unconfirmed or external parchaRowId');
    });

    it('rejects invalid inputs (negative qty, negative rate, discount > subtotal, negative tax)', async () => {
      mockUser(staff1User);

      // Negative quantity
      const reqNegQty = new NextRequest(`http://localhost/api/v1/estimates/${persistedManualEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          lines: [{ productSnapshot: 'Pipe', quantity: '-2', unitRate: '100' }]
        })
      });
      const resNegQty = await patchEstimateRoute(reqNegQty, { params: Promise.resolve({ id: persistedManualEstimate.id }) });
      expect(resNegQty.status).toBe(400);

      // Discount exceeds subtotal (qty: 1, rate: 100, discount: 150)
      const reqDiscExceed = new NextRequest(`http://localhost/api/v1/estimates/${persistedManualEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '150' }]
        })
      });
      const resDisc = await patchEstimateRoute(reqDiscExceed, { params: Promise.resolve({ id: persistedManualEstimate.id }) });
      expect(resDisc.status).toBe(400);
      const jsonDisc = await resDisc.json();
      expect(jsonDisc.error.message).toContain('Discount cannot exceed line subtotal');
    });

    it('updates customer when new customer is active and rejects update when customer is inactive', async () => {
      mockUser(staff1User);

      // 1. Changing to inactive customer is rejected (Level 5 FOR SHARE validation)
      const reqInactive = new NextRequest(`http://localhost/api/v1/estimates/${persistedManualEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          customerId: inactiveCustomer.id
        })
      });
      const resInactive = await patchEstimateRoute(reqInactive, { params: Promise.resolve({ id: persistedManualEstimate.id }) });
      expect(resInactive.status).toBe(400);
      const jsonInactive = await resInactive.json();
      expect(jsonInactive.error.message).toContain('Selected customer is invalid or inactive');

      // 2. Changing to active customer succeeds
      const reqActive = new NextRequest(`http://localhost/api/v1/estimates/${persistedManualEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          customerId: anotherActiveCustomer.id
        })
      });
      const resActive = await patchEstimateRoute(reqActive, { params: Promise.resolve({ id: persistedManualEstimate.id }) });
      expect(resActive.status).toBe(200);
      const jsonActive = await resActive.json();
      expect(jsonActive.data.estimate.customerId).toBe(anotherActiveCustomer.id);
      expect(jsonActive.data.estimate.customer.name).toBe('Verma Plumbers');
    });
  });

  describe('3. Concurrency Protection & Transaction Atomicity', () => {
    it('rejects stale edits with 409 Conflict when version has advanced (lost update prevention)', async () => {
      mockUser(staff1User);

      // Current version of persistedParchaEstimate is 2
      const current = await EstimateService.getEstimate(persistedParchaEstimate.id);
      expect(current.version).toBe(2);

      // Client A attempts to submit using stale version 0
      const staleReq = new NextRequest(`http://localhost/api/v1/estimates/${persistedParchaEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0, // STALE!
          notes: 'Stale overwrite attempt'
        })
      });

      const res = await patchEstimateRoute(staleReq, { params: Promise.resolve({ id: persistedParchaEstimate.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('CONFLICT');
      expect(json.error.message).toContain('modified by another user');

      // Verify that database was NOT altered
      const unmodified = await EstimateService.getEstimate(persistedParchaEstimate.id);
      expect(unmodified.version).toBe(2);
    });

    it('simultaneous concurrent edits via Promise.all serialize cleanly with one winner and one conflict', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        notes: 'Race target estimate',
        lines: [{ productSnapshot: 'Race Item', quantity: '1', unitRate: '500', discountAmount: '0', taxRate: '0' }]
      });
      expect(target.version).toBe(0);

      // Both requests send version: 0 concurrently
      const reqA = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Winner A edit'
        })
      });

      const reqB = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Winner B edit'
        })
      });

      const [resA, resB] = await Promise.all([
        patchEstimateRoute(reqA, { params: Promise.resolve({ id: target.id }) }),
        patchEstimateRoute(reqB, { params: Promise.resolve({ id: target.id }) })
      ]);

      const statuses = [resA.status, resB.status].sort();
      // Exactly ONE request succeeds (200) and ONE receives conflict (409)
      expect(statuses).toEqual([200, 409]);

      const final = await EstimateService.getEstimate(target.id);
      expect(final.version).toBe(1);
      expect(['Winner A edit', 'Winner B edit']).toContain(final.notes);
    });

    it('concurrent customer deactivation during edit transaction aborts edit cleanly', async () => {
      mockUser(staff1User);

      const raceCust = await CustomerService.createCustomer({
        name: 'Race Customer Edit',
        phoneNumber: '9900112233',
        isActive: true
      });

      const testEst = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Race Item 2', quantity: '1', unitRate: '300', discountAmount: '0', taxRate: '0' }]
      });

      // Hook fires after version check, before customer lock
      __setEstimateUpdateTestHook(async (stage: string) => {
        if (stage === 'after-version-check') {
          // Deactivate race customer before customer lock is checked
          await CustomerService.archiveCustomer(raceCust.id);
        }
      });

      const req = new NextRequest(`http://localhost/api/v1/estimates/${testEst.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          customerId: raceCust.id // Changing customer to raceCust
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: testEst.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.message).toContain('Selected customer is invalid or inactive');

      // Verify estimate was NOT altered and remains with original customer
      const final = await EstimateService.getEstimate(testEst.id);
      expect(final.customerId).toBe(activeCustomer.id);
      expect(final.version).toBe(0);
    });

    it('strictly forbids editing a converted estimate (409 Conflict)', async () => {
      mockUser(ownerUser);

      // Create and convert estimate to bill
      const convEst = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Convert item', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      await prisma.estimate.update({
        where: { id: convEst.id },
        data: { status: EstimateStatus.CONVERTED }
      });

      const req = new NextRequest(`http://localhost/api/v1/estimates/${convEst.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Attempting to edit converted estimate'
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: convEst.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain('Cannot edit a converted estimate');
    });

    it('verifies transaction rollback on failure leaves zero partial changes', async () => {
      mockUser(staff1User);

      const before = await EstimateService.getEstimate(persistedManualEstimate.id);
      const linesBeforeCount = await prisma.estimateLine.count({ where: { estimateId: persistedManualEstimate.id } });

      // Request with 1 valid line and 1 invalid line (negative rate)
      const req = new NextRequest(`http://localhost/api/v1/estimates/${persistedManualEstimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: before.version,
          notes: 'Should not persist',
          lines: [
            { productSnapshot: 'Valid line', quantity: '1', unitRate: '200' },
            { productSnapshot: 'Invalid line', quantity: '1', unitRate: '-50' } // Fails!
          ]
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: persistedManualEstimate.id }) });
      expect(res.status).toBe(400);

      // Assert complete rollback: lines count, notes, and version are untouched
      const after = await EstimateService.getEstimate(persistedManualEstimate.id);
      const linesAfterCount = await prisma.estimateLine.count({ where: { estimateId: persistedManualEstimate.id } });

      expect(after.version).toBe(before.version);
      expect(after.notes).toBe(before.notes);
      expect(linesAfterCount).toBe(linesBeforeCount);
    });
  });

  describe('4. Mandatory Version Enforcement & Status Transition Validation (Phase 6.3.3.2.1)', () => {
    it('rejects updates without a version (HTTP 400)', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      const req = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Missing version attempt'
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: target.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');

      // Verify DB was untouched
      const current = await EstimateService.getEstimate(target.id);
      expect(current.version).toBe(0);
      expect(current.notes).toBeNull();
    });

    it('rejects invalid version values: null, fractional, negative, and string (HTTP 400)', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      const invalidVersions = [null, 1.5, -1, '0', {}];

      for (const inv of invalidVersions) {
        const req = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: inv,
            notes: `Attempt with ${inv}`
          })
        });

        const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: target.id }) });
        expect(res.status).toBe(400);
      }

      // Verify direct service call rejects invalid version
      await expect(EstimateService.updateEstimate(target.id, { version: -1 as any, notes: 'Direct fail' }))
        .rejects.toThrow('Valid non-negative integer version is required');
      await expect(EstimateService.updateEstimate(target.id, { version: 1.5 as any, notes: 'Direct fail' }))
        .rejects.toThrow('Valid non-negative integer version is required');
      await expect(EstimateService.updateEstimate(target.id, { version: null as any, notes: 'Direct fail' }))
        .rejects.toThrow('Valid non-negative integer version is required');

      const current = await EstimateService.getEstimate(target.id);
      expect(current.version).toBe(0);
    });

    it('valid current version allows update and increments version exactly once', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });
      expect(target.version).toBe(0);

      const req = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Version 0 edit'
        })
      });

      const res = await patchEstimateRoute(req, { params: Promise.resolve({ id: target.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.estimate.version).toBe(1);
      expect(json.data.estimate.notes).toBe('Version 0 edit');

      const current = await EstimateService.getEstimate(target.id);
      expect(current.version).toBe(1);
    });

    it('stale version receives 409 Conflict without modifying estimate or lines', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        notes: 'Initial note',
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      // Update once: version 0 -> 1
      await EstimateService.updateEstimate(target.id, { version: 0, notes: 'First update' });

      // Stale request submitting version 0
      const staleReq = new NextRequest(`http://localhost/api/v1/estimates/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0, // Stale!
          notes: 'Stale update attempt'
        })
      });

      const res = await patchEstimateRoute(staleReq, { params: Promise.resolve({ id: target.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('CONFLICT');

      const current = await EstimateService.getEstimate(target.id);
      expect(current.version).toBe(1);
      expect(current.notes).toBe('First update');
    });

    it('supported status transitions succeed according to lifecycle rules', async () => {
      mockUser(staff1User);

      // 1. Create in DRAFT (version 0)
      const est = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });
      expect(est.status).toBe(EstimateStatus.DRAFT);
      expect(est.version).toBe(0);

      // 2. DRAFT -> SENT via PATCH route
      const reqSent = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          status: EstimateStatus.SENT
        })
      });
      const resSent = await patchEstimateRoute(reqSent, { params: Promise.resolve({ id: est.id }) });
      expect(resSent.status).toBe(200);
      const jsonSent = await resSent.json();
      expect(jsonSent.data.estimate.status).toBe(EstimateStatus.SENT);
      expect(jsonSent.data.estimate.version).toBe(1);

      // 3. Same status (SENT -> SENT) succeeds and increments version
      const reqSame = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          status: EstimateStatus.SENT,
          notes: 'Still sent'
        })
      });
      const resSame = await patchEstimateRoute(reqSame, { params: Promise.resolve({ id: est.id }) });
      expect(resSame.status).toBe(200);
      const jsonSame = await resSame.json();
      expect(jsonSame.data.estimate.version).toBe(2);

      // 4. SENT -> ACCEPTED via POST /status route
      const reqAccepted = new NextRequest(`http://localhost/api/v1/estimates/${est.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          status: EstimateStatus.ACCEPTED
        })
      });
      const resAccepted = await postEstimateStatusRoute(reqAccepted, { params: Promise.resolve({ id: est.id }) });
      expect(resAccepted.status).toBe(200);
      const jsonAccepted = await resAccepted.json();
      expect(jsonAccepted.data.estimate.status).toBe(EstimateStatus.ACCEPTED);
      expect(jsonAccepted.data.estimate.version).toBe(3);

      // 5. Create another estimate to test SENT -> REJECTED
      const est2 = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Tap', quantity: '1', unitRate: '200', discountAmount: '0', taxRate: '0' }]
      });

      // DRAFT -> SENT
      await EstimateService.updateStatus(est2.id, EstimateStatus.SENT, 0);

      // SENT -> REJECTED via POST /status route
      const reqReject = new NextRequest(`http://localhost/api/v1/estimates/${est2.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          status: EstimateStatus.REJECTED
        })
      });
      const resReject = await postEstimateStatusRoute(reqReject, { params: Promise.resolve({ id: est2.id }) });
      expect(resReject.status).toBe(200);
      const jsonReject = await resReject.json();
      expect(jsonReject.data.estimate.status).toBe(EstimateStatus.REJECTED);
      expect(jsonReject.data.estimate.version).toBe(2);
    });

    it('unsupported status transitions are rejected without partial updates (HTTP 400)', async () => {
      mockUser(staff1User);

      // 1. Create in DRAFT (version 0)
      const est = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        notes: 'Original note',
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      // Unsupported: DRAFT -> ACCEPTED
      const reqDraftToAccepted = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          status: EstimateStatus.ACCEPTED,
          notes: 'Illegal transition'
        })
      });
      const resDraftToAccepted = await patchEstimateRoute(reqDraftToAccepted, { params: Promise.resolve({ id: est.id }) });
      expect(resDraftToAccepted.status).toBe(400);
      const jsonDraftToAccepted = await resDraftToAccepted.json();
      expect(jsonDraftToAccepted.error.message).toContain('Invalid estimate status transition');

      // Assert no partial update occurred
      const after1 = await EstimateService.getEstimate(est.id);
      expect(after1.version).toBe(0);
      expect(after1.status).toBe(EstimateStatus.DRAFT);
      expect(after1.notes).toBe('Original note');

      // Unsupported: DRAFT -> REJECTED
      const reqDraftToRejected = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          status: EstimateStatus.REJECTED
        })
      });
      const resDraftToRejected = await patchEstimateRoute(reqDraftToRejected, { params: Promise.resolve({ id: est.id }) });
      expect(resDraftToRejected.status).toBe(400);

      // Unsupported: DRAFT -> CONVERTED via PATCH
      const reqDraftToConverted = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          status: EstimateStatus.CONVERTED
        })
      });
      const resDraftToConverted = await patchEstimateRoute(reqDraftToConverted, { params: Promise.resolve({ id: est.id }) });
      expect(resDraftToConverted.status).toBe(400);
      const jsonConverted = await resDraftToConverted.json();
      expect(jsonConverted.error.message).toContain('Cannot manually set status to CONVERTED');

      // Transition to SENT: version 0 -> 1
      await EstimateService.updateStatus(est.id, EstimateStatus.SENT, 0);

      // Unsupported: SENT -> DRAFT (cannot un-send)
      const reqSentToDraft = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          status: EstimateStatus.DRAFT
        })
      });
      const resSentToDraft = await patchEstimateRoute(reqSentToDraft, { params: Promise.resolve({ id: est.id }) });
      expect(resSentToDraft.status).toBe(400);

      // Transition to ACCEPTED: version 1 -> 2
      await EstimateService.updateStatus(est.id, EstimateStatus.ACCEPTED, 1);

      // Unsupported: ACCEPTED -> DRAFT
      const reqAccToDraft = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          status: EstimateStatus.DRAFT
        })
      });
      const resAccToDraft = await patchEstimateRoute(reqAccToDraft, { params: Promise.resolve({ id: est.id }) });
      expect(resAccToDraft.status).toBe(400);

      // Unsupported: ACCEPTED -> REJECTED
      const reqAccToRej = new NextRequest(`http://localhost/api/v1/estimates/${est.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          status: EstimateStatus.REJECTED
        })
      });
      const resAccToRej = await patchEstimateRoute(reqAccToRej, { params: Promise.resolve({ id: est.id }) });
      expect(resAccToRej.status).toBe(400);

      // Create a rejected estimate
      const estRej = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });
      await EstimateService.updateStatus(estRej.id, EstimateStatus.SENT, 0);
      await EstimateService.updateStatus(estRej.id, EstimateStatus.REJECTED, 1);

      // Unsupported: REJECTED -> DRAFT
      const reqRejToDraft = new NextRequest(`http://localhost/api/v1/estimates/${estRej.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          status: EstimateStatus.DRAFT
        })
      });
      const resRejToDraft = await patchEstimateRoute(reqRejToDraft, { params: Promise.resolve({ id: estRej.id }) });
      expect(resRejToDraft.status).toBe(400);

      // Unsupported: REJECTED -> ACCEPTED
      const reqRejToAcc = new NextRequest(`http://localhost/api/v1/estimates/${estRej.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 2,
          status: EstimateStatus.ACCEPTED
        })
      });
      const resRejToAcc = await patchEstimateRoute(reqRejToAcc, { params: Promise.resolve({ id: estRej.id }) });
      expect(resRejToAcc.status).toBe(400);
    });

    it('status update route strictly requires version and rejects stale version with 409', async () => {
      mockUser(staff1User);

      const target = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: staff1User.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      // 1. Missing version in status route
      const reqMissing = new NextRequest(`http://localhost/api/v1/estimates/${target.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: EstimateStatus.SENT
        })
      });
      const resMissing = await postEstimateStatusRoute(reqMissing, { params: Promise.resolve({ id: target.id }) });
      expect(resMissing.status).toBe(400);

      // 2. Advance version via service: 0 -> 1
      await EstimateService.updateEstimate(target.id, { version: 0, notes: 'Advance version' });

      // 3. Stale version 0 to status route
      const reqStale = new NextRequest(`http://localhost/api/v1/estimates/${target.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0, // Stale!
          status: EstimateStatus.SENT
        })
      });
      const resStale = await postEstimateStatusRoute(reqStale, { params: Promise.resolve({ id: target.id }) });
      expect(resStale.status).toBe(409);
      const jsonStale = await resStale.json();
      expect(jsonStale.error.code).toBe('CONFLICT');

      // Verify status remains DRAFT
      const current = await EstimateService.getEstimate(target.id);
      expect(current.status).toBe(EstimateStatus.DRAFT);
      expect(current.version).toBe(1);
    });

    it('CONVERTED estimates remain strictly immutable to edits and status updates (HTTP 409)', async () => {
      mockUser(ownerUser);

      const conv = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [{ productSnapshot: 'Pipe', quantity: '1', unitRate: '100', discountAmount: '0', taxRate: '0' }]
      });

      await prisma.estimate.update({
        where: { id: conv.id },
        data: { status: EstimateStatus.CONVERTED }
      });

      // 1. Attempt PATCH on CONVERTED
      const reqPatch = new NextRequest(`http://localhost/api/v1/estimates/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          notes: 'Converted edit attempt'
        })
      });
      const resPatch = await patchEstimateRoute(reqPatch, { params: Promise.resolve({ id: conv.id }) });
      expect(resPatch.status).toBe(409);
      const jsonPatch = await resPatch.json();
      expect(jsonPatch.error.message).toContain('Cannot edit a converted estimate');

      // 2. Attempt POST status on CONVERTED
      const reqStatus = new NextRequest(`http://localhost/api/v1/estimates/${conv.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 0,
          status: EstimateStatus.DRAFT
        })
      });
      const resStatus = await postEstimateStatusRoute(reqStatus, { params: Promise.resolve({ id: conv.id }) });
      expect(resStatus.status).toBe(409);
      const jsonStatus = await resStatus.json();
      expect(jsonStatus.error.message).toContain('Cannot alter status of a converted estimate');

      // 3. Direct service call throws ConflictError
      await expect(EstimateService.updateStatus(conv.id, EstimateStatus.SENT, 0))
        .rejects.toThrow('Cannot alter status of a converted estimate');
      await expect(EstimateService.updateEstimate(conv.id, { version: 0, notes: 'Fail' }))
        .rejects.toThrow('Cannot edit a converted estimate');
    });
  });
});
