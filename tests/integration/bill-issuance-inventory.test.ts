/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { InsufficientStockError, ValidationError } from '../../src/lib/errors';
import { BillStatus, MovementType, Prisma } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3 — Bill Issuance Inventory Integration', () => {
  let defaultLocation: any;
  let secondaryLocation: any;
  let inactiveLocation: any;
  let category: any;
  let product: any;
  let variant1: any;
  let variant2: any;
  let variant3: any;
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
        name: 'Bill Issuance Customer',
        phoneNumber: '9876543210',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Pipes & Fittings' } });
    product = await prisma.product.create({
      data: { name: 'PVC Pipes', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'PIPE-100', sellingPrice: 150, isActive: true }
    });
    variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'PIPE-200', sellingPrice: 250, isActive: true }
    });
    variant3 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'PIPE-300', sellingPrice: 350, isActive: true }
    });

    defaultLocation = await prisma.inventoryLocation.create({
      data: { code: 'DEFAULT-WAREHOUSE', name: 'Default Warehouse', isActive: true, isDefault: true }
    });
    secondaryLocation = await prisma.inventoryLocation.create({
      data: { code: 'BRANCH-SHOP', name: 'Branch Shop', isActive: true, isDefault: false }
    });
    inactiveLocation = await prisma.inventoryLocation.create({
      data: { code: 'CLOSED-DEPOT', name: 'Closed Depot', isActive: false, isDefault: false }
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

  it('1. successfully issues a draft bill and transitions status to ISSUED', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          variantSnapshot: 'PIPE-100',
          quantity: '5',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    expect(bill.status).toBe(BillStatus.DRAFT);

    const issuedBill = await BillService.issueBill(bill.id);
    expect(issuedBill.status).toBe(BillStatus.ISSUED);
    expect(issuedBill.locationId).toBe(defaultLocation.id);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.ISSUED);
  });

  it('2. deducts the exact inventory balance for a single variant line', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 50, reserved: 5 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '10',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await BillService.issueBill(bill.id);

    const balance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    expect(balance?.quantity.toString()).toBe('40');
    expect(balance?.reserved.toString()).toBe('5');
  });

  it('3. deducts inventory balances for multiple distinct variant lines in the bill', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 30, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: defaultLocation.id, quantity: 40, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100',
          quantity: '12',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: variant2.id,
          productSnapshot: 'PVC Pipes 200',
          quantity: '15',
          unitRate: '250',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await BillService.issueBill(bill.id);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: defaultLocation.id } }
    });

    expect(bal1?.quantity.toString()).toBe('18');
    expect(bal2?.quantity.toString()).toBe('25');
  });

  it('4. aggregates repeated variant lines in a bill and deducts the combined quantity once', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 50, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100 Batch A',
          quantity: '8',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100 Batch B',
          quantity: '14',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await BillService.issueBill(bill.id);

    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    expect(bal?.quantity.toString()).toBe('28'); // 50 - (8 + 14) = 28

    const movements = await prisma.stockMovement.findMany({
      where: { billId: bill.id, variantId: variant1.id }
    });
    expect(movements.length).toBe(1);
    expect(movements[0]!.quantity.toString()).toBe('22');
  });

  it('5. allows issuance of bills containing non-inventory lines (null variantId) without error or deduction', async () => {
    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: null,
          productSnapshot: 'Plumbing Consultation Fee',
          quantity: '1',
          unitRate: '500',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    const issuedBill = await BillService.issueBill(bill.id);
    expect(issuedBill.status).toBe(BillStatus.ISSUED);

    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(0);
  });

  it('6. persists resolved locationId on bill when originally unset on draft', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: null,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '3',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    expect(bill.locationId).toBeNull();

    const issuedBill = await BillService.issueBill(bill.id);
    expect(issuedBill.status).toBe(BillStatus.ISSUED);
    expect(issuedBill.locationId).toBe(defaultLocation.id);

    const updated = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(updated?.locationId).toBe(defaultLocation.id);
  });

  it('7. uses explicitly provided locationId from issuance options over existing draft locationId', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 20, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: secondaryLocation.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '5',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    const issuedBill = await BillService.issueBill(bill.id, { locationId: secondaryLocation.id });
    expect(issuedBill.status).toBe(BillStatus.ISSUED);
    expect(issuedBill.locationId).toBe(secondaryLocation.id);

    const defaultBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    const secondaryBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: secondaryLocation.id } }
    });
    expect(defaultBal?.quantity.toString()).toBe('20'); // untouched
    expect(secondaryBal?.quantity.toString()).toBe('25'); // deducted
  });

  it('8. falls back to default active location when neither bill nor options provide locationId', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 15, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: null,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '2',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    const issuedBill = await BillService.issueBill(bill.id);
    expect(issuedBill.locationId).toBe(defaultLocation.id);

    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    expect(bal?.quantity.toString()).toBe('13');
  });

  it('9. rejects issuance with ValidationError if specified location does not exist', async () => {
    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: null,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '2',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await expect(
      BillService.issueBill(bill.id, { locationId: '00000000-0000-0000-0000-000000000099' })
    ).rejects.toThrow(ValidationError);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.DRAFT);
  });

  it('10. rejects issuance with ValidationError if specified location is inactive', async () => {
    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: inactiveLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes',
          quantity: '2',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await expect(BillService.issueBill(bill.id)).rejects.toThrow(ValidationError);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.DRAFT);
  });

  it('11. rejects issuance with InsufficientStockError and rolls back bill status and all balances when stock is insufficient', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 50, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: defaultLocation.id, quantity: 2, reserved: 0 } // insufficient for requested 10
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100',
          quantity: '10',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        },
        {
          variantId: variant2.id,
          productSnapshot: 'PVC Pipes 200',
          quantity: '10',
          unitRate: '250',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await expect(BillService.issueBill(bill.id)).rejects.toThrow(InsufficientStockError);

    // Verify bill remains in DRAFT
    const persistedBill = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persistedBill?.status).toBe(BillStatus.DRAFT);

    // Verify balances remain untouched
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: defaultLocation.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50');
    expect(bal2?.quantity.toString()).toBe('2');

    // Verify no movements were recorded
    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(0);
  });

  it('12. rejects issuance with InsufficientStockError when variant has no balance record at location', async () => {
    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant3.id,
          productSnapshot: 'PVC Pipes 300',
          quantity: '1',
          unitRate: '350',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await expect(BillService.issueBill(bill.id)).rejects.toThrow(InsufficientStockError);

    const persisted = await prisma.bill.findUnique({ where: { id: bill.id } });
    expect(persisted?.status).toBe(BillStatus.DRAFT);
  });

  it('13. creates StockMovement records with ISSUE type, billNumber reference, and billId link', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 20, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100',
          quantity: '7',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await BillService.issueBill(bill.id, { reason: 'Customer invoice dispatched' });

    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(1);
    const m = movements[0]!;
    expect(m.type).toBe(MovementType.ISSUE);
    expect(m.variantId).toBe(variant1.id);
    expect(m.locationId).toBe(defaultLocation.id);
    expect(m.quantity.toString()).toBe('7');
    expect(m.reference).toBe(bill.billNumber);
    expect(m.reason).toBe('Customer invoice dispatched');
  });

  it('14. replays issuance idempotently when already ISSUED without duplicate deductions or movements', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: 30, reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes 100',
          quantity: '5',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    const firstIssue = await BillService.issueBill(bill.id);
    expect(firstIssue.status).toBe(BillStatus.ISSUED);

    // Call issue again
    const secondIssue = await BillService.issueBill(bill.id);
    expect(secondIssue.status).toBe(BillStatus.ISSUED);
    expect(secondIssue.id).toBe(firstIssue.id);

    // Balance should have been deducted once (30 - 5 = 25)
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    expect(bal?.quantity.toString()).toBe('25');

    // Only one movement should exist
    const movements = await prisma.stockMovement.findMany({ where: { billId: bill.id } });
    expect(movements.length).toBe(1);
  });

  it('15. supports fractional / 3-decimal quantities (e.g. 2.750, 0.125) with exact decimal precision', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: defaultLocation.id, quantity: new Prisma.Decimal('10.000'), reserved: 0 }
    });

    const bill = await BillService.createBill({
      customerId: customer.id,
      locationId: defaultLocation.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'PVC Pipes Fractional',
          quantity: '2.375',
          unitRate: '150',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });

    await BillService.issueBill(bill.id);

    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: defaultLocation.id } }
    });
    expect(bal?.quantity.toString()).toBe('7.625'); // 10.000 - 2.375 = 7.625

    const movement = await prisma.stockMovement.findFirst({ where: { billId: bill.id } });
    expect(movement?.quantity.toString()).toBe('2.375');
  });
});
