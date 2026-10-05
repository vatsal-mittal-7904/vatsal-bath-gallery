/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { PaymentService } from '../../src/features/billing/payment.service';
import { ConflictError } from '../../src/lib/errors';
import { BillStatus, MovementType, PaymentMethod } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3 — Bill Cancellation Inventory Integration', () => {
  let location: any;
  let category: any;
  let product: any;
  let variant1: any;
  let variant2: any;
  let customer: any;

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
        name: 'Cancellation Customer',
        phoneNumber: '9123456789',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Valves & Taps' } });
    product = await prisma.product.create({
      data: { name: 'Brass Valves', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'VALVE-01', sellingPrice: 200, isActive: true }
    });
    variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'VALVE-02', sellingPrice: 400, isActive: true }
    });

    location = await prisma.inventoryLocation.create({
      data: { code: 'CANCEL-LOC', name: 'Cancellation Warehouse', isActive: true, isDefault: true }
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
    await prisma.inventoryBalance.deleteMany();
  });

  it('1. cancelling an eligible ISSUED bill transitions status to CANCELLED', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Brass Valve',
          quantity: '5',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    const cancelledBill = await BillService.cancelBill(bill.id);
    expect(cancelledBill.status).toBe(BillStatus.CANCELLED);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.CANCELLED);
  });

  it('2. restores the exact historically deducted stock quantity grounded in committed ISSUE movements', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 50, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Brass Valve',
          quantity: '12',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Balance after issuance: 50 - 12 = 38
    let bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('38');

    // Cancel bill
    await BillService.cancelBill(bill.id);

    // Balance restored: 38 + 12 = 50
    bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('50');
  });

  it('3. creates POSITIVE_ADJUSTMENT stock movement referencing bill and variant', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Brass Valve',
          quantity: '6',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    await BillService.cancelBill(bill.id, { reason: 'Customer changed mind' });

    const movements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(movements.length).toBe(1);
    const m = movements[0]!;
    expect(m.type).toBe(MovementType.POSITIVE_ADJUSTMENT);
    expect(m.variantId).toBe(variant1.id);
    expect(m.locationId).toBe(location.id);
    expect(m.quantity.toString()).toBe('6');
    expect(m.reference).toBe(bill.billNumber);
    expect(m.reason).toBe('Customer changed mind');
  });

  it('4. correctly restores multiple variants across the bill', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 40, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: location.id, quantity: 25, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1',
          quantity: '10',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: variant2.id,
          productSnapshot: 'Valve 2',
          quantity: '7',
          unitRate: '400',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Cancel
    await BillService.cancelBill(bill.id);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('40');
    expect(bal2?.quantity.toString()).toBe('25');

    const restoreMovements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(restoreMovements.length).toBe(2);
  });

  it('5. correctly restores aggregated variants (where bill had duplicate lines for same variant)', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 100, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1 Line 1',
          quantity: '15',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1 Line 2',
          quantity: '25',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // After issuance: 100 - 40 = 60
    let bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('60');

    // Cancel
    await BillService.cancelBill(bill.id);

    // After cancellation: 60 + 40 = 100
    bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('100');

    const restoreMovements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(restoreMovements.length).toBe(1);
    expect(restoreMovements[0]!.quantity.toString()).toBe('40');
  });

  it('6. cancelling a DRAFT bill transitions status to CANCELLED without touching stock balances or creating movements', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 50, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve Draft',
          quantity: '10',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    expect(bill.status).toBe(BillStatus.DRAFT);

    const cancelledBill = await BillService.cancelBill(bill.id);
    expect(cancelledBill.status).toBe(BillStatus.CANCELLED);

    // Balance remains untouched at 50
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('50');

    // No movements exist
    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(0);
  });

  it('7. cancelling an issued bill with non-inventory lines only (no stock movements) transitions to CANCELLED cleanly', async () => {
    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: null,
          productSnapshot: 'Plumbing Labor Charge',
          quantity: '1',
          unitRate: '1000',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    const cancelledBill = await BillService.cancelBill(bill.id);
    expect(cancelledBill.status).toBe(BillStatus.CANCELLED);

    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(0);
  });

  it('8. rejects cancellation of an issued bill if original stock movements are missing (ConflictError)', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1',
          quantity: '5',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Artificially delete the stock movement to simulate data anomaly
    await prisma.stockMovement.deleteMany({ where: { billId: bill.id } });

    await expect(BillService.cancelBill(bill.id)).rejects.toThrow(ConflictError);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.ISSUED);
  });

  it('9. rejects cancellation of a bill with recorded payments with ConflictError', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1',
          quantity: '2',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Record partial payment
    await PaymentService.recordPayment(bill.id, {
      amount: '200',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    });

    await expect(BillService.cancelBill(bill.id)).rejects.toThrow(ConflictError);

    // Status remains PARTIALLY_PAID
    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.PARTIALLY_PAID);

    // Stock should not be restored
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('28'); // 30 - 2 = 28
  });

  it('10. rejects cancellation of PAID or PARTIALLY_PAID bills with ConflictError', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1',
          quantity: '1',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '0'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // Fully pay the bill
    await PaymentService.recordPayment(bill.id, {
      amount: '200',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    });

    const paidBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(paidBill?.status).toBe(BillStatus.PAID);

    await expect(BillService.cancelBill(bill.id)).rejects.toThrow(ConflictError);
  });

  it('11. replaying cancellation on an already CANCELLED bill returns idempotently without double-restoration or duplicate movements', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Valve 1',
          quantity: '5',
          unitRate: '200',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    await BillService.issueBill(bill.id);

    // First cancel
    const firstCancel = await BillService.cancelBill(bill.id);
    expect(firstCancel.status).toBe(BillStatus.CANCELLED);

    // Second cancel replay
    const secondCancel = await BillService.cancelBill(bill.id);
    expect(secondCancel.status).toBe(BillStatus.CANCELLED);
    expect(secondCancel.id).toBe(firstCancel.id);

    // Balance should only be restored once (20 - 5 + 5 = 20)
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal?.quantity.toString()).toBe('20');

    // Only one POSITIVE_ADJUSTMENT movement should exist
    const restoreMovements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(restoreMovements.length).toBe(1);
  });
});
