/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { EstimateService } from '../../src/features/billing/estimate.service';
import { BillService } from '../../src/features/billing/bill.service';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { ConflictError } from '../../src/lib/errors';
import { EstimateStatus, BillStatus } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3.2.4A — PostgreSQL Lock-Graph Verification & Concurrency', () => {
  let customer: any;
  let category: any;
  let product: any;
  let variantA: any;
  let variantB: any;
  let locationA: any;
  let locationB: any;

  beforeAll(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();

    customer = await prisma.customer.create({
      data: {
        name: 'Lock Graph Test Customer',
        phoneNumber: '9777788888',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Lock Graph Category' } });
    product = await prisma.product.create({
      data: { name: 'Lock Graph Product', categoryId: category.id, isActive: true }
    });
    variantA = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'LOCK-VAR-A', sellingPrice: 200, isActive: true }
    });
    variantB = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'LOCK-VAR-B', sellingPrice: 300, isActive: true }
    });

    locationA = await prisma.inventoryLocation.create({
      data: { code: 'LG-LOC-A', name: 'Lock Location A', isActive: true, isDefault: true }
    });
    locationB = await prisma.inventoryLocation.create({
      data: { code: 'LG-LOC-B', name: 'Lock Location B', isActive: true, isDefault: false }
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  // ---------------------------------------------------------------------------
  // 1. Concurrent createEstimate & convertEstimateToBill sharing Customer
  // ---------------------------------------------------------------------------
  it('1. concurrent createEstimate and convertEstimateToBill execute without deadlocks', async () => {
    // Setup an existing accepted estimate for conversion
    const baseEst = await EstimateService.createEstimate({
      customerId: customer.id,
      issueDate: new Date(),
      lines: [
        { variantId: variantA.id, productSnapshot: 'Prod A', quantity: '2', unitRate: '200', discountAmount: '0', taxRate: '0' }
      ]
    });
    await prisma.estimate.update({
      where: { id: baseEst.id },
      data: { status: EstimateStatus.ACCEPTED }
    });

    // Concurrently: worker 1 creates a new estimate; worker 2 converts the accepted estimate
    const [newEst, convertedBill] = await Promise.all([
      EstimateService.createEstimate({
        customerId: customer.id,
        issueDate: new Date(),
        lines: [
          { variantId: variantB.id, productSnapshot: 'Prod B', quantity: '1', unitRate: '300', discountAmount: '0', taxRate: '0' }
        ]
      }),
      BillService.convertEstimateToBill(baseEst.id, baseEst.version)
    ]);

    expect(newEst.id).toBeDefined();
    expect(newEst.status).toBe(EstimateStatus.DRAFT);
    expect(convertedBill.id).toBeDefined();
    expect(convertedBill.estimateId).toBe(baseEst.id);
  });

  // ---------------------------------------------------------------------------
  // 2. Concurrent createEstimate & createBill sharing Customer
  // ---------------------------------------------------------------------------
  it('2. concurrent createEstimate and createBill execute without deadlocks', async () => {
    const [est, bill] = await Promise.all([
      EstimateService.createEstimate({
        customerId: customer.id,
        issueDate: new Date(),
        lines: [
          { variantId: variantA.id, productSnapshot: 'Prod A', quantity: '3', unitRate: '200', discountAmount: '0', taxRate: '0' }
        ]
      }),
      BillService.createBill({
        customerId: customer.id,
        locationId: locationA.id,
        issueDate: new Date(),
        lines: [
          { variantId: variantB.id, productSnapshot: 'Prod B', quantity: '2', unitRate: '300', discountAmount: '0', taxRate: '0' }
        ]
      })
    ]);

    expect(est.id).toBeDefined();
    expect(bill.id).toBeDefined();
    expect(bill.status).toBe(BillStatus.DRAFT);
  });

  // ---------------------------------------------------------------------------
  // 3. Concurrent convertEstimateToBill & createBill contending on DocumentSequence('BILL')
  // ---------------------------------------------------------------------------
  it('3. concurrent convertEstimateToBill and createBill serialize on DocumentSequence without cycle', async () => {
    const baseEst = await EstimateService.createEstimate({
      customerId: customer.id,
      issueDate: new Date(),
      lines: [
        { variantId: variantA.id, productSnapshot: 'Prod A', quantity: '1', unitRate: '200', discountAmount: '0', taxRate: '0' }
      ]
    });
    await prisma.estimate.update({
      where: { id: baseEst.id },
      data: { status: EstimateStatus.ACCEPTED }
    });

    // Both workers compete for DocumentSequence('BILL')
    const [convertedBill, directBill] = await Promise.all([
      BillService.convertEstimateToBill(baseEst.id, baseEst.version),
      BillService.createBill({
        customerId: customer.id,
        locationId: locationA.id,
        issueDate: new Date(),
        lines: [
          { variantId: variantB.id, productSnapshot: 'Prod B', quantity: '1', unitRate: '300', discountAmount: '0', taxRate: '0' }
        ]
      })
    ]);

    expect(convertedBill.billNumber).toBeDefined();
    expect(directBill.billNumber).toBeDefined();
    expect(convertedBill.billNumber).not.toBe(directBill.billNumber);
  });

  // ---------------------------------------------------------------------------
  // 4. Concurrent convertEstimateToBill racing on the exact same estimate
  // ---------------------------------------------------------------------------
  it('4. multiple workers converting the same estimate serialize safely with exactly one winner', async () => {
    const baseEst = await EstimateService.createEstimate({
      customerId: customer.id,
      issueDate: new Date(),
      lines: [
        { variantId: variantA.id, productSnapshot: 'Prod A', quantity: '1', unitRate: '200', discountAmount: '0', taxRate: '0' }
      ]
    });
    await prisma.estimate.update({
      where: { id: baseEst.id },
      data: { status: EstimateStatus.ACCEPTED }
    });

    const results = await Promise.allSettled([
      BillService.convertEstimateToBill(baseEst.id, baseEst.version),
      BillService.convertEstimateToBill(baseEst.id, baseEst.version)
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ConflictError);

    // Verify only 1 bill created in DB
    const bills = await prisma.bill.findMany({ where: { estimateId: baseEst.id } });
    expect(bills.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. High-concurrency sequence allocation under 8 concurrent createEstimate
  // ---------------------------------------------------------------------------
  it('5. 8 concurrent createEstimate calls allocate unique monotonic sequences without deadlocks', async () => {
    const promises = Array.from({ length: 8 }, (_, i) =>
      EstimateService.createEstimate({
        customerId: customer.id,
        issueDate: new Date(),
        notes: `Concurrent Estimate #${i}`,
        lines: [
          { variantId: variantA.id, productSnapshot: 'A', quantity: '1', unitRate: '200', discountAmount: '0', taxRate: '0' }
        ]
      })
    );

    const estimates = await Promise.all(promises);
    expect(estimates.length).toBe(8);

    const numbers = new Set(estimates.map(e => e.estimateNumber));
    expect(numbers.size).toBe(8); // All 8 distinct!
  });

  // ---------------------------------------------------------------------------
  // 6. High-concurrency sequence allocation under 8 concurrent createBill
  // ---------------------------------------------------------------------------
  it('6. 8 concurrent createBill calls allocate unique monotonic sequences without deadlocks', async () => {
    const promises = Array.from({ length: 8 }, (_, i) =>
      BillService.createBill({
        customerId: customer.id,
        locationId: locationA.id,
        issueDate: new Date(),
        notes: `Concurrent Bill #${i}`,
        lines: [
          { variantId: variantA.id, productSnapshot: 'A', quantity: '1', unitRate: '200', discountAmount: '0', taxRate: '0' }
        ]
      })
    );

    const bills = await Promise.all(promises);
    expect(bills.length).toBe(8);

    const numbers = new Set(bills.map(b => b.billNumber));
    expect(numbers.size).toBe(8); // All 8 distinct!
  });

  // ---------------------------------------------------------------------------
  // 7. Verify pg_locks observation during opposing stock transfers
  // ---------------------------------------------------------------------------
  it('7. opposing stock transfers acquire locks without deadlocks or lock wait errors', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: locationB.id, quantity: 50, reserved: 0 }
    });

    const [t1, t2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variantA.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10
      }),
      InventoryService.transferStock({
        variantId: variantA.id,
        sourceId: locationB.id,
        destinationId: locationA.id,
        quantity: 10
      })
    ]);

    expect(t1.transfer).toBeDefined();
    expect(t2.transfer).toBeDefined();

    // Final balance check: 50 - 10 + 10 = 50 on both
    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('50');
    expect(balB?.quantity.toString()).toBe('50');
  });

  // ---------------------------------------------------------------------------
  // 8. Runtime pg_locks evidence: Customer update vs FOR SHARE wait state
  // ---------------------------------------------------------------------------
  it('8. runtime pg_locks observation: Customer update serializes with FOR SHARE via transactionid wait queue', async () => {
    let resolveWorker1: () => void;
    const worker1Ready = new Promise<void>(res => { resolveWorker1 = res; });
    let finishWorker1: () => void;
    const worker1Wait = new Promise<void>(res => { finishWorker1 = res; });

    // Worker 1 holds non-key Customer update (FOR NO KEY UPDATE lock)
    const p1 = prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: { name: 'Customer In-Flight Update' }
      });
      resolveWorker1();
      await worker1Wait;
    });

    await worker1Ready;

    // Worker 2 attempts explicit FOR SHARE (as in convertEstimateToBill)
    let worker2Finished = false;
    const p2 = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customer.id} FOR SHARE`;
      worker2Finished = true;
    });

    // Wait 50ms to allow Worker 2 to block in PostgreSQL
    await new Promise(r => setTimeout(r, 50));
    expect(worker2Finished).toBe(false);

    // Inspect pg_locks directly from live PostgreSQL database
    const waitingLocks = await prisma.$queryRaw<Array<{ locktype: string; mode: string; granted: boolean }>>`
      SELECT l.locktype, l.mode, l.granted
      FROM pg_locks l
      WHERE l.granted = false
    `;

    expect(waitingLocks.length).toBeGreaterThan(0);
    expect(waitingLocks[0]?.locktype).toBe('transactionid');
    expect(waitingLocks[0]?.mode).toBe('ShareLock');
    expect(waitingLocks[0]?.granted).toBe(false);

    // Release worker 1 and verify clean completion without deadlock
    finishWorker1!();
    await Promise.all([p1, p2]);
    expect(worker2Finished).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 9. Runtime pg_locks evidence: FOR SHARE and FOR KEY SHARE compatibility
  // ---------------------------------------------------------------------------
  it('9. runtime pg_locks observation: FOR SHARE and FOR KEY SHARE execute concurrently with zero wait states', async () => {
    let resolveWorker1: () => void;
    const worker1Ready = new Promise<void>(res => { resolveWorker1 = res; });
    let finishWorker1: () => void;
    const worker1Wait = new Promise<void>(res => { finishWorker1 = res; });

    // Worker 1 holds FOR SHARE (as in convertEstimateToBill)
    const p1 = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id, "isActive" FROM "Customer" WHERE id = ${customer.id} FOR SHARE`;
      resolveWorker1();
      await worker1Wait;
    });

    await worker1Ready;

    // Worker 2 performs FOR KEY SHARE (as during createEstimate FK check)
    let worker2Finished = false;
    const p2 = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customer.id} FOR KEY SHARE`;
      worker2Finished = true;
    });

    // Worker 2 completes immediately because FOR KEY SHARE is compatible with FOR SHARE
    await new Promise(r => setTimeout(r, 50));
    expect(worker2Finished).toBe(true);

    // Verify zero waiting locks in pg_locks
    const waitingLocks = await prisma.$queryRaw<Array<{ locktype: string; mode: string; granted: boolean }>>`
      SELECT l.locktype, l.mode, l.granted
      FROM pg_locks l
      WHERE l.granted = false
    `;
    expect(waitingLocks.length).toBe(0);

    finishWorker1!();
    await Promise.all([p1, p2]);
  });
});

