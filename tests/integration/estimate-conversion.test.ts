/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db/client';
import { POST as convertEstimateRoute } from '../../src/app/api/v1/estimates/[id]/convert/route';
import { EstimateService } from '../../src/features/billing/estimate.service';
import { BillService } from '../../src/features/billing/bill.service';
import { CustomerService } from '../../src/features/billing/customer.service';
import * as authGuard from '../../src/features/auth/auth.guard';
import { EstimateStatus } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Estimate-to-Bill Conversion Workflow (Phase 6.3.3.3 & 6.3.3.3.1)', () => {
  let ownerUser: any;
  let staff1User: any;
  let staff2User: any;

  let activeCustomer: any;
  let inactiveCustomer: any;

  let testCategory: any;
  let testProduct: any;
  let testVariant: any;

  let currentUser: any;

  beforeAll(async () => {
    // Dynamic mock auth tracking currentUser
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      return currentUser;
    });

    // Clean up all tables
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
      data: { id: 'user-owner-conv', email: 'owner-conv@test.com', name: 'Shop Owner', role: 'OWNER', passwordHash: 'hash' }
    });
    staff1User = await prisma.user.create({
      data: { id: 'user-staff1-conv', email: 'staff1-conv@test.com', name: 'Staff Member 1', role: 'STAFF', passwordHash: 'hash' }
    });
    staff2User = await prisma.user.create({
      data: { id: 'user-staff2-conv', email: 'staff2-conv@test.com', name: 'Staff Member 2', role: 'STAFF', passwordHash: 'hash' }
    });

    currentUser = ownerUser;

    // 2. Create Customers
    activeCustomer = await CustomerService.createCustomer({
      name: 'Conversion Test Customer',
      phoneNumber: '9876543210',
      billingAddress: '42 Market Street',
      gstin: '07AAAAA0000A1Z5'
    });

    inactiveCustomer = await prisma.customer.create({
      data: {
        name: 'Inactive Customer',
        phoneNumber: '9998887776',
        isActive: false
      }
    });

    // 3. Create Catalogue Item
    testCategory = await prisma.category.create({
      data: { name: 'Pipes & Fittings' }
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'CPVC Pipe 1 inch',
        categoryId: testCategory.id
      }
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'PIPE-CPVC-1IN-3M',
        sellingPrice: 250,
        attributes: { size: '3 Meter' }
      }
    });
  });

  beforeEach(() => {
    currentUser = ownerUser;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
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
  });

  // Helper to create an estimate in ACCEPTED state
  async function createAcceptedEstimate(creatorId: string, customLines?: any[], customerId?: string) {
    const lines = customLines || [
      {
        variantId: testVariant.id,
        productSnapshot: 'CPVC Pipe 1 inch',
        variantSnapshot: '3 Meter',
        skuSnapshot: 'PIPE-CPVC-1IN-3M',
        quantity: '4',
        unitOfMeasure: 'length',
        unitRate: '250',
        discountAmount: '50',
        taxRate: '18'
      }
    ];

    const draft = await EstimateService.createEstimate({
      customerId: customerId !== undefined ? customerId : activeCustomer.id,
      creatorId,
      issueDate: new Date(),
      lines
    });

    // DRAFT -> SENT -> ACCEPTED
    await EstimateService.updateStatus(draft.id, EstimateStatus.SENT, draft.version);
    const sent = await EstimateService.getEstimate(draft.id);
    const accepted = await EstimateService.updateStatus(draft.id, EstimateStatus.ACCEPTED, sent.version);

    return accepted;
  }

  describe('1. Mandatory Version Enforcement (Phase 6.3.3.3.1)', () => {
    it('rejects conversion when version is missing from body with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(json.error.details)).toMatch(/version/i);
    });

    it('rejects conversion when body is completely empty with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST'
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects conversion when body is malformed JSON with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json: true '
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toMatch(/Invalid JSON payload/i);
    });

    it('rejects conversion when version is null with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: null })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects conversion when version is a string with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '0' })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects conversion when version is negative with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: -1 })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(json.error.details)).toMatch(/non-negative/i);
    });

    it('rejects conversion when version is fractional with HTTP 400', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1.5 })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(json.error.details)).toMatch(/integer/i);
    });

    it('runtime service check: rejects direct call without valid integer version', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      await expect(
        BillService.convertEstimateToBill(estimate.id, undefined as any)
      ).rejects.toThrow(/Valid non-negative integer version is required/i);

      await expect(
        BillService.convertEstimateToBill(estimate.id, null as any)
      ).rejects.toThrow(/Valid non-negative integer version is required/i);

      await expect(
        BillService.convertEstimateToBill(estimate.id, -1)
      ).rejects.toThrow(/Valid non-negative integer version is required/i);

      await expect(
        BillService.convertEstimateToBill(estimate.id, 2.5)
      ).rejects.toThrow(/Valid non-negative integer version is required/i);

      await expect(
        BillService.convertEstimateToBill(estimate.id, '2' as any)
      ).rejects.toThrow(/Valid non-negative integer version is required/i);
    });

    it('rejects stale version with HTTP 409 Conflict without creating a bill or modifying estimate', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      const billsBefore = await prisma.bill.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });

      // Stale version: estimate.version - 1
      const staleVersion = estimate.version - 1;
      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: staleVersion })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/modified concurrently/i);

      // Assert no bill was created
      const billCount = await prisma.bill.count({ where: { estimateId: estimate.id } });
      expect(billCount).toBe(0);
      const billsAfter = await prisma.bill.count();
      expect(billsAfter).toBe(billsBefore);

      // Assert estimate remains ACCEPTED with same version
      const currentEst = await EstimateService.getEstimate(estimate.id);
      expect(currentEst.status).toBe(EstimateStatus.ACCEPTED);
      expect(currentEst.version).toBe(estimate.version);

      // Assert sequence not incremented
      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);
    });

    it('succeeds with current version, atomically increments version to version+1', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: estimate.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.bill).toBeDefined();

      const currentEst = await EstimateService.getEstimate(estimate.id);
      expect(currentEst.status).toBe(EstimateStatus.CONVERTED);
      expect(currentEst.version).toBe(estimate.version + 1);
    });
  });

  describe('2. Explicit Lifecycle & Ineligibility Verification (Phase 6.3.3.3.1)', () => {
    it('explicitly rejects conversion of an EXPIRED estimate with HTTP 409 Conflict', async () => {
      // 1. Create estimate
      const draft = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [
          {
            productSnapshot: 'Expired Test Item',
            quantity: '2',
            unitRate: '150',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      });

      // 2. Transition DRAFT -> SENT -> EXPIRED
      await EstimateService.updateStatus(draft.id, EstimateStatus.SENT, draft.version);
      const sent = await EstimateService.getEstimate(draft.id);
      const expired = await EstimateService.updateStatus(draft.id, EstimateStatus.EXPIRED, sent.version);
      expect(expired.status).toBe(EstimateStatus.EXPIRED);

      const billsBefore = await prisma.bill.count();

      // 3. Attempt conversion with valid version
      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${expired.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: expired.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: expired.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/Only accepted estimates can be converted to bills. Current status: EXPIRED/i);

      // 4. Assert: No bill created, estimate untouched, no sequence increments
      const billsAfter = await prisma.bill.count();
      expect(billsAfter).toBe(billsBefore);

      const refreshed = await EstimateService.getEstimate(expired.id);
      expect(refreshed.status).toBe(EstimateStatus.EXPIRED);
      expect(refreshed.version).toBe(expired.version);

      const estimateBills = await prisma.bill.count({ where: { estimateId: expired.id } });
      expect(estimateBills).toBe(0);
    });

    it('rejects conversion of a DRAFT estimate with HTTP 409 Conflict', async () => {
      const draft = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [
          {
            productSnapshot: 'Draft Item',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      });

      const billsBefore = await prisma.bill.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${draft.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: draft.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/Only accepted estimates can be converted to bills. Current status: DRAFT/i);

      const count = await prisma.bill.count({ where: { estimateId: draft.id } });
      expect(count).toBe(0);
      const billsAfter = await prisma.bill.count();
      expect(billsAfter).toBe(billsBefore);

      const refreshed = await EstimateService.getEstimate(draft.id);
      expect(refreshed.status).toBe(EstimateStatus.DRAFT);
      expect(refreshed.version).toBe(draft.version);

      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);
    });

    it('rejects conversion of a SENT estimate with HTTP 409 Conflict', async () => {
      const draft = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [
          {
            productSnapshot: 'Sent Item',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      });
      const sent = await EstimateService.updateStatus(draft.id, EstimateStatus.SENT, draft.version);

      const billsBefore = await prisma.bill.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${draft.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: sent.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/Only accepted estimates can be converted to bills. Current status: SENT/i);

      const count = await prisma.bill.count({ where: { estimateId: draft.id } });
      expect(count).toBe(0);
      const billsAfter = await prisma.bill.count();
      expect(billsAfter).toBe(billsBefore);

      const refreshed = await EstimateService.getEstimate(draft.id);
      expect(refreshed.status).toBe(EstimateStatus.SENT);
      expect(refreshed.version).toBe(sent.version);

      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);
    });

    it('rejects conversion of a REJECTED estimate with HTTP 409 Conflict', async () => {
      const draft = await EstimateService.createEstimate({
        customerId: activeCustomer.id,
        creatorId: ownerUser.id,
        issueDate: new Date(),
        lines: [
          {
            productSnapshot: 'Rejected Item',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      });
      await EstimateService.updateStatus(draft.id, EstimateStatus.SENT, draft.version);
      const sent = await EstimateService.getEstimate(draft.id);
      const rejected = await EstimateService.updateStatus(draft.id, EstimateStatus.REJECTED, sent.version);

      const billsBefore = await prisma.bill.count();
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${draft.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: rejected.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/Only accepted estimates can be converted to bills. Current status: REJECTED/i);

      const count = await prisma.bill.count({ where: { estimateId: draft.id } });
      expect(count).toBe(0);
      const billsAfter = await prisma.bill.count();
      expect(billsAfter).toBe(billsBefore);

      const refreshed = await EstimateService.getEstimate(draft.id);
      expect(refreshed.status).toBe(EstimateStatus.REJECTED);
      expect(refreshed.version).toBe(rejected.version);

      const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
      expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);
    });

    it('rejects duplicate conversion of an already CONVERTED estimate with HTTP 409 Conflict', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      // 1. Convert once
      const bill = await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);
      expect(bill).toBeDefined();

      const convertedEst = await EstimateService.getEstimate(estimate.id);
      expect(convertedEst.status).toBe(EstimateStatus.CONVERTED);

      // 2. Try to convert again via API
      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: convertedEst.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toMatch(/already been converted/i);
    });
  });

  describe('3. Authoritative Financial Recalculation & Upward Ceiling Rounding', () => {
    it('applies upward ceiling rounding to lines and totals during bill generation', async () => {
      // Qty 3.333, Rate 33.33
      // Subtotal = ceil(3.333 * 33.33) = ceil(111.08889) = 112
      // Discount = 10
      // Taxable = 112 - 10 = 102
      // Tax Rate = 18% -> Tax Amount = 102 * 0.18 = 18.36
      // Line Amount = ceil(102 + 18.36) = ceil(120.36) = 121
      const estimate = await createAcceptedEstimate(ownerUser.id, [
        {
          productSnapshot: 'Ceiling Item',
          quantity: '3.333',
          unitRate: '33.33',
          discountAmount: '10',
          taxRate: '18'
        }
      ]);

      const bill = await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);

      expect(bill.lines).toHaveLength(1);
      const line = bill.lines![0]!;
      expect(line.subtotal).toBe('112');
      expect(line.taxAmount).toBe('18.36');
      expect(line.lineAmount).toBe('121');

      expect(bill.subtotal).toBe('112');
      expect(bill.discountTotal).toBe('10');
      expect(bill.taxTotal).toBe('18.36');
      expect(bill.grandTotal).toBe('121');
      expect(bill.amountPaid).toBe('0');
      expect(bill.balanceDue).toBe('121');
    });

    it('preserves line order, snapshots, and metadata on created bill lines', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id, [
        {
          variantId: testVariant.id,
          productSnapshot: 'Line First',
          variantSnapshot: '3 Meter',
          skuSnapshot: 'PIPE-CPVC-1IN-3M',
          quantity: '1',
          unitOfMeasure: 'pcs',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: null,
          productSnapshot: 'Line Second',
          quantity: '2',
          unitOfMeasure: 'box',
          unitRate: '50',
          discountAmount: '5',
          taxRate: '12'
        }
      ]);

      const bill = await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);

      expect(bill.lines).toHaveLength(2);
      expect(bill.lines![0]!.productSnapshot).toBe('Line First');
      expect(bill.lines![0]!.variantSnapshot).toBe('3 Meter');
      expect(bill.lines![0]!.skuSnapshot).toBe('PIPE-CPVC-1IN-3M');
      expect(bill.lines![0]!.sortOrder).toBe(0);

      expect(bill.lines![1]!.productSnapshot).toBe('Line Second');
      expect(bill.lines![1]!.variantSnapshot).toBeNull();
      expect(bill.lines![1]!.sortOrder).toBe(1);
    });
  });

  describe('4. Concurrency, Optimistic Versioning, and Idempotency Replays', () => {
    it('returns existing bill on idempotent replay with the same idempotency key', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      const idempotencyKey = 'conv-idem-test-key-1';

      // 1. Initial conversion
      const req1 = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ version: estimate.version })
      });
      const res1 = await convertEstimateRoute(req1, { params: Promise.resolve({ id: estimate.id }) });
      expect(res1.status).toBe(201);
      const json1 = await res1.json();
      const billId1 = json1.data.bill.id;

      // 2. Replay with identical idempotency key
      const req2 = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ version: estimate.version })
      });
      const res2 = await convertEstimateRoute(req2, { params: Promise.resolve({ id: estimate.id }) });
      expect(res2.status).toBe(201);
      const json2 = await res2.json();
      expect(json2.data.bill.id).toBe(billId1);
      expect(json2.data.bill.billNumber).toBe(json1.data.bill.billNumber);

      // Verify only ONE bill was created in the database
      const billCount = await prisma.bill.count({ where: { estimateId: estimate.id } });
      expect(billCount).toBe(1);
    });

    it('rejects reusing an existing idempotency key across different estimates with 409 Conflict', async () => {
      const estimateA = await createAcceptedEstimate(ownerUser.id);
      const estimateB = await createAcceptedEstimate(ownerUser.id);
      const sharedKey = 'shared-idempotency-key-conv';

      // Convert estimateA with sharedKey
      const billA = await BillService.convertEstimateToBill(estimateA.id, estimateA.version, ownerUser.id, sharedKey);
      expect(billA).toBeDefined();

      // Attempt to convert estimateB with same sharedKey
      await expect(
        BillService.convertEstimateToBill(estimateB.id, estimateB.version, ownerUser.id, sharedKey)
      ).rejects.toThrow(/Idempotency key already used for another bill/i);
    });

    it('handles parallel conversion races safely: exactly 1 bill created', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);

      // Fire 2 concurrent conversion attempts
      const [resA, resB] = await Promise.allSettled([
        BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id, 'race-key-A'),
        BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id, 'race-key-B')
      ]);

      const fulfilled = [resA, resB].filter(r => r.status === 'fulfilled');
      const rejected = [resA, resB].filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The rejected one must be a conflict error
      const reason = (rejected[0] as PromiseRejectedResult).reason;
      expect(reason.message).toMatch(/already been converted|concurrently modified/i);

      // Check DB: exactly 1 bill
      const billCount = await prisma.bill.count({ where: { estimateId: estimate.id } });
      expect(billCount).toBe(1);
    });

    it('handles parallel conversions with the same idempotency key safely: exactly 1 bill created', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      const idempotencyKey = `race-same-key-${Date.now()}`;

      const [resA, resB] = await Promise.allSettled([
        BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id, idempotencyKey),
        BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id, idempotencyKey)
      ]);

      const fulfilled = [resA, resB].filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      if (fulfilled.length === 2) {
        const billA = (resA as PromiseFulfilledResult<any>).value;
        const billB = (resB as PromiseFulfilledResult<any>).value;
        expect(billA.id).toBe(billB.id);
        expect(billA.billNumber).toBe(billB.billNumber);
      }

      // Check DB: exactly 1 bill created
      const billCount = await prisma.bill.count({ where: { estimateId: estimate.id } });
      expect(billCount).toBe(1);
    });
  });

  describe('5. Converted Estimate Immutability & Traceability', () => {
    it('prohibits editing lines of an estimate after conversion', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);

      const refreshed = await EstimateService.getEstimate(estimate.id);
      expect(refreshed.status).toBe(EstimateStatus.CONVERTED);

      // Attempt to update lines
      await expect(
        EstimateService.updateEstimate(estimate.id, {
          version: refreshed.version,
          notes: 'Attempted modification after conversion'
        })
      ).rejects.toThrow(/Cannot edit a converted estimate/i);
    });

    it('prohibits altering the status of an estimate after conversion', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);

      const refreshed = await EstimateService.getEstimate(estimate.id);

      await expect(
        EstimateService.updateStatus(estimate.id, EstimateStatus.ACCEPTED, refreshed.version)
      ).rejects.toThrow(/Cannot alter status of a converted estimate/i);
    });

    it('returns estimate link in getBill query', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      const bill = await BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id);

      const fetchedBill = await BillService.getBill(bill.id);
      expect(fetchedBill.estimate).toBeDefined();
      expect(fetchedBill.estimate?.id).toBe(estimate.id);
      expect(fetchedBill.estimate?.estimateNumber).toBe(estimate.estimateNumber);
    });
  });

  describe('6. Customer & Line Integrity Checks', () => {
    it('rejects conversion if the customer is inactive with a ValidationError', async () => {
      // Create estimate directly with inactive customer
      const draft = await prisma.estimate.create({
        data: {
          estimateNumber: `EST-INACT-${Date.now()}`,
          customerId: inactiveCustomer.id,
          creatorId: ownerUser.id,
          status: EstimateStatus.ACCEPTED, // force ACCEPTED
          subtotal: 100,
          discountTotal: 0,
          taxTotal: 18,
          grandTotal: 118,
          version: 2,
          lines: {
            create: [
              {
                productSnapshot: 'Item with Inactive Customer',
                quantity: 1,
                unitRate: 100,
                subtotal: 100,
                lineAmount: 118
              }
            ]
          }
        }
      });

      await expect(
        BillService.convertEstimateToBill(draft.id, draft.version, ownerUser.id)
      ).rejects.toThrow(/Customer associated with this estimate is invalid or inactive/i);
    });

    it('rejects conversion if the estimate has no lines with a ValidationError', async () => {
      const draft = await prisma.estimate.create({
        data: {
          estimateNumber: `EST-NOLINE-${Date.now()}`,
          customerId: activeCustomer.id,
          creatorId: ownerUser.id,
          status: EstimateStatus.ACCEPTED,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 0,
          version: 0
        }
      });

      await expect(
        BillService.convertEstimateToBill(draft.id, draft.version, ownerUser.id)
      ).rejects.toThrow(/Estimate must contain at least one line item/i);
    });

    it('verifies Customer Level 5 FOR SHARE lock blocks concurrent customer deactivation until conversion finishes', async () => {
      const customer = await CustomerService.createCustomer({
        name: `Cust-Lock-${Date.now()}`,
        phoneNumber: `9899${Math.floor(100000 + Math.random() * 900000)}`
      });

      let releaseLock!: () => void;
      const lockReleasePromise = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      let notifyAcquired!: () => void;
      const lockAcquiredPromise = new Promise<void>((resolve) => {
        notifyAcquired = resolve;
      });

      let archiveFinished = false;

      // 1. Transaction 1 acquires FOR SHARE on Customer
      const tx1 = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id, "isActive" FROM "Customer" WHERE id = ${customer.id} FOR SHARE`;
        notifyAcquired();
        await lockReleasePromise;
      });

      // Wait until FOR SHARE lock is acquired
      await lockAcquiredPromise;

      // 2. Attempt concurrent archive while FOR SHARE is held
      const archivePromise = CustomerService.archiveCustomer(customer.id).then((res) => {
        archiveFinished = true;
        return res;
      });

      // 3. Wait 80ms to prove that archiveCustomer (requiring exclusive row update) is blocked by PostgreSQL
      await new Promise((r) => setTimeout(r, 80));
      expect(archiveFinished).toBe(false);

      // 4. Release lock in transaction 1
      releaseLock();
      await tx1;

      // 5. Now archiveCustomer unblocks and completes
      await archivePromise;
      expect(archiveFinished).toBe(true);

      const archivedCust = await CustomerService.getCustomer(customer.id);
      expect(archivedCust.isActive).toBe(false);
    });

    it('rolls back entire transaction and preserves document sequence on conversion failure', async () => {
      const estimate = await createAcceptedEstimate(ownerUser.id);
      const seqBefore = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
      const billsBefore = await prisma.bill.count();

      // Deactivate customer directly in DB right before conversion
      await prisma.customer.update({
        where: { id: activeCustomer.id },
        data: { isActive: false }
      });

      try {
        await expect(
          BillService.convertEstimateToBill(estimate.id, estimate.version, ownerUser.id)
        ).rejects.toThrow(/invalid or inactive/i);

        // Sequence must NOT be incremented
        const seqAfter = await prisma.documentSequence.findUnique({ where: { id: 'BILL' } });
        expect(seqAfter?.lastValue).toBe(seqBefore?.lastValue);

        // No bill created
        const billsAfter = await prisma.bill.count();
        expect(billsAfter).toBe(billsBefore);

        // Estimate status and version remain unchanged
        const refreshed = await EstimateService.getEstimate(estimate.id);
        expect(refreshed.status).toBe(EstimateStatus.ACCEPTED);
        expect(refreshed.version).toBe(estimate.version);
      } finally {
        // Restore customer active state
        await prisma.customer.update({
          where: { id: activeCustomer.id },
          data: { isActive: true }
        });
      }
    });
  });

  describe('7. Authorization, Creator Scoping, and Idempotency Protection', () => {
    it('forbids staff from converting an estimate created by another staff user', async () => {
      // Estimate created by staff1
      const estimate = await createAcceptedEstimate(staff1User.id);

      // Acting as staff2
      currentUser = staff2User;

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: estimate.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toMatch(/permission/i);
    });

    it('forbids unauthorized staff from replaying conversion for another staff users estimate', async () => {
      // Estimate created by staff1
      const estimate = await createAcceptedEstimate(staff1User.id);
      const idempotencyKey = 'staff1-conv-key';

      // Staff 1 converts their own estimate
      currentUser = staff1User;
      const req1 = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ version: estimate.version })
      });
      const res1 = await convertEstimateRoute(req1, { params: Promise.resolve({ id: estimate.id }) });
      expect(res1.status).toBe(201);

      // Now staff2 attempts to replay with the same idempotencyKey for staff1's estimate
      currentUser = staff2User;
      const req2 = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ version: estimate.version })
      });
      const res2 = await convertEstimateRoute(req2, { params: Promise.resolve({ id: estimate.id }) });
      expect(res2.status).toBe(403);
      const json2 = await res2.json();
      expect(json2.error.message).toMatch(/permission/i);
    });

    it('allows staff to convert their own estimate', async () => {
      const estimate = await createAcceptedEstimate(staff1User.id);

      // Acting as staff1
      currentUser = staff1User;

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: estimate.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.bill.creatorId).toBe(staff1User.id);
    });

    it('allows OWNER to convert an estimate created by any staff user', async () => {
      const estimate = await createAcceptedEstimate(staff2User.id);

      // Acting as owner
      currentUser = ownerUser;

      const req = new NextRequest(`http://localhost:3000/api/v1/estimates/${estimate.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: estimate.version })
      });

      const res = await convertEstimateRoute(req, { params: Promise.resolve({ id: estimate.id }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.bill.creatorId).toBe(ownerUser.id);
    });
  });
});
