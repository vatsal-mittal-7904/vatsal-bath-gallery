/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService, __setBillTestHook } from '../../src/features/billing/bill.service';
import { ConflictError, InsufficientStockError, ValidationError } from '../../src/lib/errors';
import { BillStatus, MovementType } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3 — Bill and Inventory Real PostgreSQL Concurrency Tests', () => {
  let location: any;
  let category: any;
  let product: any;
  let variantA: any;
  let variantB: any;
  let customer1: any;
  let customer2: any;

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

    customer1 = await prisma.customer.create({
      data: { name: 'Concurrency Customer 1', phoneNumber: '9888811111', isActive: true }
    });
    customer2 = await prisma.customer.create({
      data: { name: 'Concurrency Customer 2', phoneNumber: '9888822222', isActive: true }
    });

    category = await prisma.category.create({ data: { name: 'Concurrency Cat' } });
    product = await prisma.product.create({
      data: { name: 'Concurrency Product', categoryId: category.id, isActive: true }
    });

    // variantA id < variantB id
    const v1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CONCUR-A', sellingPrice: 100, isActive: true }
    });
    const v2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CONCUR-B', sellingPrice: 200, isActive: true }
    });
    if (v1.id < v2.id) {
      variantA = v1;
      variantB = v2;
    } else {
      variantA = v2;
      variantB = v1;
    }

    location = await prisma.inventoryLocation.create({
      data: { code: 'CONCUR-LOC', name: 'Concurrency Warehouse', isActive: true, isDefault: true }
    });
  });

  afterAll(async () => {
    __setBillTestHook(null);
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
    __setBillTestHook(null);
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  it('1. serializes concurrent duplicate issuance requests on the same bill via Level 7 lock, ensuring exactly one deduction and idempotent replay', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 50, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '10',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    // Run 2 simultaneous issuance attempts with test hook delay
    let hookCalls = 0;
    __setBillTestHook(async (stage) => {
      if (stage === 'after_bill_lock') {
        hookCalls++;
        if (hookCalls === 1) {
          // Delay first thread to allow second thread to contest Level 7 lock
          await new Promise((r) => setTimeout(r, 60));
        }
      }
    });

    const results = await Promise.allSettled([
      BillService.issueBill(bill.id, { idempotencyKey: `issue-race:${bill.id}` }),
      BillService.issueBill(bill.id, { idempotencyKey: `issue-race:${bill.id}` })
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');

    // Balance deducted exactly once: 50 - 10 = 40
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('40');

    // Exactly one stock movement recorded
    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(1);
    expect(movements[0]!.quantity.toString()).toBe('10');
  });

  it('2. prevents overselling when competing bills for different customers contend for the same stock concurrently', async () => {
    // Only 15 in stock
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 15, reserved: 0 }
    });

    // Bill 1 needs 10
    const bill1 = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '10',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    // Bill 2 needs 10 (combined 20 > 15 available)
    const bill2 = await BillService.createBill({
      customerId: customer2.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '10',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    const results = await Promise.allSettled([
      BillService.issueBill(bill1.id),
      BillService.issueBill(bill2.id)
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    // Remaining balance is non-negative and exactly 5 (15 - 10)
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('5');

    // Winning bill is ISSUED, losing bill remains DRAFT
    const b1 = await prisma.bill.findUnique({ where: { id: bill1.id } });
    const b2 = await prisma.bill.findUnique({ where: { id: bill2.id } });

    const statuses = [b1?.status, b2?.status];
    expect(statuses).toContain(BillStatus.ISSUED);
    expect(statuses).toContain(BillStatus.DRAFT);
  });

  it('3. avoids deadlocks when concurrent multi-line bills touch variants in opposite order (deterministic Level 8 ordering)', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 50, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantB.id, locationId: location.id, quantity: 50, reserved: 0 }
    });

    // Bill 1: [variantA, variantB]
    const bill1 = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        { variantId: variantA.id, productSnapshot: 'A', quantity: '5', unitRate: '100', discountAmount: '0', taxRate: '0' },
        { variantId: variantB.id, productSnapshot: 'B', quantity: '5', unitRate: '200', discountAmount: '0', taxRate: '0' }
      ]
    });

    // Bill 2: [variantB, variantA] (opposing order)
    const bill2 = await BillService.createBill({
      customerId: customer2.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        { variantId: variantB.id, productSnapshot: 'B', quantity: '8', unitRate: '200', discountAmount: '0', taxRate: '0' },
        { variantId: variantA.id, productSnapshot: 'A', quantity: '8', unitRate: '100', discountAmount: '0', taxRate: '0' }
      ]
    });

    // Execute concurrently without deadlock
    const [res1, res2] = await Promise.all([
      BillService.issueBill(bill1.id),
      BillService.issueBill(bill2.id)
    ]);

    expect(res1.status).toBe(BillStatus.ISSUED);
    expect(res2.status).toBe(BillStatus.ISSUED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantB.id, locationId: location.id } }
    });

    expect(balA?.quantity.toString()).toBe('37'); // 50 - 5 - 8 = 37
    expect(balB?.quantity.toString()).toBe('37'); // 50 - 5 - 8 = 37
  });

  it('4. serializes concurrent issuance and cancellation on the same bill without deadlock, preserving accurate net inventory', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '5',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    // Simultaneous issue and cancel calls
    const results = await Promise.allSettled([
      BillService.issueBill(bill.id),
      BillService.cancelBill(bill.id)
    ]);
    expect(results.length).toBe(2);

    // Check database state
    const finalBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    const finalBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });

    // Case 1: Cancel ran first on DRAFT -> Bill is CANCELLED, Issue failed with ConflictError ("Only draft bills can be issued. Current status: CANCELLED"), balance is 20.
    // Case 2: Issue ran first -> Bill became ISSUED, Cancel ran second -> Bill is CANCELLED and stock restored, balance is 20.
    // Either way, net stock balance MUST be exactly 20!
    expect(finalBal?.quantity.toString()).toBe('20');
    expect(finalBill?.status).toBe(BillStatus.CANCELLED);
  });

  it('5. serializes concurrent cancellation requests on the same issued bill, restoring stock exactly once', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '10',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Balance after issuance: 20
    let bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('20');

    // Run 2 simultaneous cancellations
    let cancelCalls = 0;
    __setBillTestHook(async (stage) => {
      if (stage === 'after_bill_lock') {
        cancelCalls++;
        if (cancelCalls === 1) {
          await new Promise((r) => setTimeout(r, 60));
        }
      }
    });

    const [c1, c2] = await Promise.all([
      BillService.cancelBill(bill.id, { idempotencyKey: `cancel-race:${bill.id}` }),
      BillService.cancelBill(bill.id, { idempotencyKey: `cancel-race:${bill.id}` })
    ]);

    expect(c1.status).toBe(BillStatus.CANCELLED);
    expect(c2.status).toBe(BillStatus.CANCELLED);

    // Stock must be restored exactly once (20 + 10 = 30)
    bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('30');

    // Exactly 1 POSITIVE_ADJUSTMENT movement
    const restoreMovements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(restoreMovements.length).toBe(1);
    expect(restoreMovements[0]!.quantity.toString()).toBe('10');
  });

  it('6. preserves atomic rollback if unhandled failure occurs during issuance, leaving draft status and balances unchanged', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 25, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '5',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    // Throw error after stock deduction inside transaction to test full rollback
    __setBillTestHook(async (stage) => {
      if (stage === 'after_stock_deduction') {
        throw new Error('Simulated crash right after stock deduction');
      }
    });

    await expect(BillService.issueBill(bill.id)).rejects.toThrow('Simulated crash right after stock deduction');

    // Verify bill remains in DRAFT
    const b = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(b?.status).toBe(BillStatus.DRAFT);

    // Verify balance is completely unchanged
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('25');
  });

  it('7. ensures updateBill rejects modifying lines or location on an ISSUED bill, preventing inventory drift', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '5',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Attempt to change lines on issued bill
    await expect(
      BillService.updateBill(bill.id, {
        lines: [
          {
            variantId: variantA.id,
            productSnapshot: 'Item A Modified',
            quantity: '8',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '18'
          }
        ]
      })
    ).rejects.toThrow(ConflictError);

    // Attempt to change location on issued bill
    await expect(
      BillService.updateBill(bill.id, {
        locationId: '00000000-0000-0000-0000-000000000001'
      })
    ).rejects.toThrow(ConflictError);
  });

  it('8. ensures updateBill rejects transitioning status to ISSUED or CANCELLED via generic update', async () => {
    const bill = await BillService.createBill({
      customerId: customer1.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variantA.id,
          productSnapshot: 'Item A',
          quantity: '2',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await expect(
      BillService.updateBill(bill.id, { status: BillStatus.ISSUED })
    ).rejects.toThrow(ValidationError);

    await expect(
      BillService.updateBill(bill.id, { status: BillStatus.CANCELLED })
    ).rejects.toThrow(ValidationError);
  });
});
