/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { locationSchema } from '../../src/features/inventory/inventory.validation';
import { billSchema } from '../../src/features/billing/billing.validation';
import { ConflictError } from '../../src/lib/errors';
import { MovementType, BillStatus, EstimateStatus, Prisma } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.1 — Inventory and Billing Schema Integration', () => {
  let testUser: any;
  let testCustomer: any;
  let testCategory: any;
  let testProduct: any;
  let testVariant: any;

  beforeAll(async () => {
    // Clean up dependent tables
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.documentSequence.deleteMany();
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();

    testUser = await prisma.user.create({
      data: {
        id: 'user-schema-test',
        email: 'schema-test@vatsalbath.com',
        name: 'Schema Test User',
        role: 'OWNER',
        passwordHash: 'dummy'
      }
    });

    testCustomer = await prisma.customer.create({
      data: {
        id: 'cust-schema-test',
        name: 'Schema Customer',
        phoneNumber: '9876543210',
        isActive: true
      }
    });

    testCategory = await prisma.category.create({
      data: { name: 'Schema Test Category' }
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'Schema Test Basin',
        categoryId: testCategory.id,
        isActive: true
      }
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'SCHEMA-BASIN-01',
        sellingPrice: 1200.0,
        isActive: true
      }
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.documentSequence.deleteMany();
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.inventoryLocation.deleteMany();
  });

  describe('1. Bill and Location Relations', () => {
    it('creates a bill without locationId (nullable)', async () => {
      const bill = await prisma.bill.create({
        data: {
          billNumber: 'BILL-NOLOC-01',
          customerId: testCustomer.id,
          subtotal: 1000,
          discountTotal: 0,
          taxTotal: 180,
          grandTotal: 1180,
          balanceDue: 1180,
          status: BillStatus.DRAFT
        },
        include: { location: true }
      });

      expect(bill.id).toBeDefined();
      expect(bill.locationId).toBeNull();
      expect(bill.location).toBeNull();

      const fetched = await prisma.bill.findUnique({
        where: { id: bill.id },
        include: { location: true }
      });
      expect(fetched?.locationId).toBeNull();
      expect(fetched?.location).toBeNull();
    });

    it('creates a bill with a valid locationId and establishes bi-directional relation', async () => {
      const location = await prisma.inventoryLocation.create({
        data: {
          code: 'LOC-MAIN',
          name: 'Main Showroom',
          isDefault: false
        }
      });

      const bill = await prisma.bill.create({
        data: {
          billNumber: 'BILL-WITHLOC-01',
          customerId: testCustomer.id,
          locationId: location.id,
          subtotal: 2000,
          discountTotal: 0,
          taxTotal: 360,
          grandTotal: 2360,
          balanceDue: 2360,
          status: BillStatus.DRAFT
        },
        include: { location: true }
      });

      expect(bill.locationId).toBe(location.id);
      expect(bill.location).toBeDefined();
      expect(bill.location?.name).toBe('Main Showroom');

      // Bi-directional check from InventoryLocation -> bills
      const locWithBills = await prisma.inventoryLocation.findUnique({
        where: { id: location.id },
        include: { bills: true }
      });
      expect(locWithBills?.bills).toHaveLength(1);
      expect(locWithBills?.bills[0]?.id).toBe(bill.id);
    });

    it('rejects bill creation with an invalid non-existent locationId via foreign key constraint', async () => {
      const invalidLocationId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.bill.create({
          data: {
            billNumber: 'BILL-INVALID-LOC',
            customerId: testCustomer.id,
            locationId: invalidLocationId,
            subtotal: 500,
            discountTotal: 0,
            taxTotal: 0,
            grandTotal: 500,
            balanceDue: 500
          }
        })
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('enforces onDelete: Restrict when attempting to delete a location with associated bills', async () => {
      const location = await prisma.inventoryLocation.create({
        data: {
          code: 'LOC-RESTRICT',
          name: 'Restricted Location'
        }
      });

      await prisma.bill.create({
        data: {
          billNumber: 'BILL-LOC-RESTRICT',
          customerId: testCustomer.id,
          locationId: location.id,
          subtotal: 100,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 100,
          balanceDue: 100
        }
      });

      // Attempting to delete the location must fail due to onDelete: Restrict foreign key constraint
      await expect(
        prisma.inventoryLocation.delete({
          where: { id: location.id }
        })
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);

      // Verify the location was NOT deleted
      const stillExists = await prisma.inventoryLocation.findUnique({
        where: { id: location.id }
      });
      expect(stillExists).not.toBeNull();
    });
  });

  describe('2. StockMovement and Bill Relations', () => {
    it('creates a stock movement without billId (nullable)', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-STK-01', name: 'Stock Test Location 1' }
      });

      const movement = await prisma.stockMovement.create({
        data: {
          variantId: testVariant.id,
          locationId: location.id,
          userId: testUser.id,
          type: MovementType.POSITIVE_ADJUSTMENT,
          quantity: 10,
          reason: 'Manual adjustment'
        },
        include: { bill: true }
      });

      expect(movement.id).toBeDefined();
      expect(movement.billId).toBeNull();
      expect(movement.bill).toBeNull();
    });

    it('creates a stock movement with valid billId and establishes bi-directional relation', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-STK-02', name: 'Stock Test Location 2' }
      });

      const bill = await prisma.bill.create({
        data: {
          billNumber: 'BILL-STK-REL-01',
          customerId: testCustomer.id,
          subtotal: 1000,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 1000,
          balanceDue: 1000
        }
      });

      const movement = await prisma.stockMovement.create({
        data: {
          variantId: testVariant.id,
          locationId: location.id,
          userId: testUser.id,
          billId: bill.id,
          type: MovementType.ISSUE,
          quantity: 2,
          reason: 'Bill fulfillment'
        },
        include: { bill: true }
      });

      expect(movement.billId).toBe(bill.id);
      expect(movement.bill?.id).toBe(bill.id);

      // Bi-directional check from Bill -> stockMovements
      const billWithMovements = await prisma.bill.findUnique({
        where: { id: bill.id },
        include: { stockMovements: true }
      });
      expect(billWithMovements?.stockMovements).toHaveLength(1);
      expect(billWithMovements?.stockMovements[0]?.id).toBe(movement.id);
    });

    it('rejects stock movement with invalid non-existent billId via foreign key constraint', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-STK-03', name: 'Stock Test Location 3' }
      });

      const invalidBillId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.stockMovement.create({
          data: {
            variantId: testVariant.id,
            locationId: location.id,
            billId: invalidBillId,
            type: MovementType.ISSUE,
            quantity: 1,
            reason: 'Invalid bill test'
          }
        })
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('enforces onDelete: SetNull when deleting a bill with linked stock movements', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-STK-04', name: 'Stock Test Location 4' }
      });

      const bill = await prisma.bill.create({
        data: {
          billNumber: 'BILL-SETNULL-01',
          customerId: testCustomer.id,
          subtotal: 500,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 500,
          balanceDue: 500
        }
      });

      const movement = await prisma.stockMovement.create({
        data: {
          variantId: testVariant.id,
          locationId: location.id,
          billId: bill.id,
          type: MovementType.ISSUE,
          quantity: 3,
          reason: 'Fulfillment before bill delete'
        }
      });

      // Delete the bill
      await prisma.bill.delete({ where: { id: bill.id } });

      // Verify the stock movement still exists in the immutable audit ledger
      const movementAfterDelete = await prisma.stockMovement.findUnique({
        where: { id: movement.id }
      });
      expect(movementAfterDelete).not.toBeNull();
      // Verify billId has been set to NULL
      expect(movementAfterDelete?.billId).toBeNull();
    });
  });

  describe('3. Default Location Uniqueness (Partial Unique Index)', () => {
    it('allows multiple locations with isDefault = false', async () => {
      const loc1 = await prisma.inventoryLocation.create({
        data: { code: 'DEF-F1', name: 'Non-default 1', isDefault: false }
      });
      const loc2 = await prisma.inventoryLocation.create({
        data: { code: 'DEF-F2', name: 'Non-default 2', isDefault: false }
      });
      const loc3 = await prisma.inventoryLocation.create({
        data: { code: 'DEF-F3', name: 'Non-default 3' } // default in schema is false
      });

      expect(loc1.isDefault).toBe(false);
      expect(loc2.isDefault).toBe(false);
      expect(loc3.isDefault).toBe(false);

      const all = await prisma.inventoryLocation.findMany({
        where: { code: { startsWith: 'DEF-F' } }
      });
      expect(all).toHaveLength(3);
    });

    it('allows one location with isDefault = true, but rejects a second isDefault = true with P2002', async () => {
      const defaultLoc = await prisma.inventoryLocation.create({
        data: { code: 'DEF-T1', name: 'Primary Warehouse', isDefault: true }
      });
      expect(defaultLoc.isDefault).toBe(true);

      // Attempt to create second default location
      await expect(
        prisma.inventoryLocation.create({
          data: { code: 'DEF-T2', name: 'Secondary Warehouse', isDefault: true }
        })
      ).rejects.toMatchObject({
        code: 'P2002'
      });
    });

    it('rejects updating an existing non-default location to isDefault = true if one already exists', async () => {
      await prisma.inventoryLocation.create({
        data: { code: 'DEF-EXISTING', name: 'Existing Default', isDefault: true }
      });

      const secondLoc = await prisma.inventoryLocation.create({
        data: { code: 'DEF-SECOND', name: 'Second Location', isDefault: false }
      });

      // Attempt to update second location to isDefault = true
      await expect(
        prisma.inventoryLocation.update({
          where: { id: secondLoc.id },
          data: { isDefault: true }
        })
      ).rejects.toMatchObject({
        code: 'P2002'
      });
    });
  });

  describe('4. Billing and Conversion Non-Deduction Invariants', () => {
    it('converting an estimate to a bill does NOT deduct inventory or create stock movements', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-NO-DEDUCT', name: 'No Deduct Location' }
      });

      // Set up initial stock balance of 50 units
      const initialBalance = await prisma.inventoryBalance.create({
        data: {
          variantId: testVariant.id,
          locationId: location.id,
          quantity: 50,
          reserved: 0
        }
      });

      // Create an accepted estimate
      const estimate = await prisma.estimate.create({
        data: {
          estimateNumber: 'EST-CONV-NODED-01',
          customerId: testCustomer.id,
          status: EstimateStatus.ACCEPTED,
          issueDate: new Date(),
          subtotal: 2400,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 2400,
          version: 0,
          lines: {
            create: [
              {
                variantId: testVariant.id,
                productSnapshot: testProduct.name,
                variantSnapshot: 'Default',
                skuSnapshot: testVariant.sku,
                quantity: 2,
                unitRate: 1200,
                discountAmount: 0,
                taxRate: 0,
                taxAmount: 0,
                subtotal: 2400,
                lineAmount: 2400,
                sortOrder: 0
              }
            ]
          }
        }
      });

      // Convert estimate to bill
      const bill = await BillService.convertEstimateToBill(estimate.id, 0, testUser.id);
      expect(bill.id).toBeDefined();

      // Invariant 1: No stock movement was created for this conversion
      const movementCount = await prisma.stockMovement.count({
        where: { billId: bill.id }
      });
      expect(movementCount).toBe(0);

      // Invariant 2: Inventory balance remains strictly unchanged at 50 units
      const balanceAfter = await prisma.inventoryBalance.findUnique({
        where: { id: initialBalance.id }
      });
      expect(balanceAfter?.quantity.toNumber()).toBe(50);
      expect(balanceAfter?.reserved.toNumber()).toBe(0);
    });

    it('creating a draft bill succeeds regardless of inventory balance (even when zero stock)', async () => {
      // Confirm no inventory balance exists for testVariant in any location
      const currentBalances = await prisma.inventoryBalance.findMany({
        where: { variantId: testVariant.id }
      });
      for (const b of currentBalances) {
        await prisma.inventoryBalance.delete({ where: { id: b.id } });
      }

      // Create draft bill requesting 100 units of variant with 0 balance
      const draftBill = await BillService.createBill({
        customerId: testCustomer.id,
        issueDate: new Date(),
        creatorId: testUser.id,
        lines: [
          {
            variantId: testVariant.id,
            productSnapshot: testProduct.name,
            variantSnapshot: 'Default',
            skuSnapshot: testVariant.sku,
            quantity: '100',
            unitRate: '1200',
            discountAmount: '0',
            taxRate: '0'
          }
        ]
      });

      expect(draftBill.id).toBeDefined();
      expect(draftBill.status).toBe(BillStatus.DRAFT);
      expect(Number(draftBill.grandTotal)).toBe(120000);

      // No stock movements created
      const movements = await prisma.stockMovement.findMany({
        where: { billId: draftBill.id }
      });
      expect(movements).toHaveLength(0);
    });

    it('creating a bill with locationId via BillService persists the location relation', async () => {
      const location = await prisma.inventoryLocation.create({
        data: { code: 'LOC-BILL-SVC', name: 'Service Location Test' }
      });

      const bill = await BillService.createBill({
        customerId: testCustomer.id,
        locationId: location.id,
        issueDate: new Date(),
        creatorId: testUser.id,
        lines: [
          {
            variantId: testVariant.id,
            productSnapshot: testProduct.name,
            quantity: '1',
            unitRate: '1200',
            discountAmount: '0',
            taxRate: '0'
          }
        ]
      });

      expect(bill.locationId).toBe(location.id);
      expect(bill.location).toBeDefined();
      expect(bill.location?.code).toBe('LOC-BILL-SVC');

      // Update bill to another location
      const location2 = await prisma.inventoryLocation.create({
        data: { code: 'LOC-BILL-SVC-2', name: 'Service Location Test 2' }
      });

      const updated = await BillService.updateBill(bill.id, {
        locationId: location2.id
      });

      expect(updated.locationId).toBe(location2.id);
      expect(updated.location?.code).toBe('LOC-BILL-SVC-2');
    });
  });

  describe('5. Validation Schema and Service Method Verification', () => {
    it('locationSchema accepts isDefault boolean and defaults to false when omitted', () => {
      const parsedWithDefault = locationSchema.parse({
        code: 'SCHEMA-LOC-01',
        name: 'Schema Loc 1',
        isDefault: true
      });
      expect(parsedWithDefault.isDefault).toBe(true);

      const parsedOmitted = locationSchema.parse({
        code: 'SCHEMA-LOC-02',
        name: 'Schema Loc 2'
      });
      expect(parsedOmitted.isDefault).toBe(false);
    });

    it('billSchema accepts optional/nullable locationId and rejects non-uuid values', () => {
      const validWithLoc = billSchema.safeParse({
        billNumber: 'BILL-ZOD-01',
        locationId: 'a0000000-0000-4000-8000-000000000000',
        issueDate: new Date(),
        subtotal: '100',
        discountTotal: '0',
        taxTotal: '0',
        grandTotal: '100',
        amountPaid: '0',
        balanceDue: '100',
        lines: [
          {
            productSnapshot: 'Item 1',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '0',
            taxAmount: '0',
            subtotal: '100',
            lineAmount: '100'
          }
        ]
      });
      expect(validWithLoc.success).toBe(true);

      const validWithNullLoc = billSchema.safeParse({
        billNumber: 'BILL-ZOD-02',
        locationId: null,
        issueDate: new Date(),
        subtotal: '100',
        discountTotal: '0',
        taxTotal: '0',
        grandTotal: '100',
        amountPaid: '0',
        balanceDue: '100',
        lines: [
          {
            productSnapshot: 'Item 2',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '0',
            taxAmount: '0',
            subtotal: '100',
            lineAmount: '100'
          }
        ]
      });
      expect(validWithNullLoc.success).toBe(true);

      const invalidLoc = billSchema.safeParse({
        billNumber: 'BILL-ZOD-03',
        locationId: 'not-a-uuid',
        issueDate: new Date(),
        subtotal: '100',
        discountTotal: '0',
        taxTotal: '0',
        grandTotal: '100',
        amountPaid: '0',
        balanceDue: '100',
        lines: [
          {
            productSnapshot: 'Item 3',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '0',
            taxAmount: '0',
            subtotal: '100',
            lineAmount: '100'
          }
        ]
      });
      expect(invalidLoc.success).toBe(false);
    });

    it('InventoryService throws ConflictError when creating duplicate default location', async () => {
      await InventoryService.createLocation({
        code: 'SVC-DEF-1',
        name: 'Service Default 1',
        isDefault: true
      });

      await expect(
        InventoryService.createLocation({
          code: 'SVC-DEF-2',
          name: 'Service Default 2',
          isDefault: true
        })
      ).rejects.toThrowError(ConflictError);
    });

    it('InventoryService throws ConflictError when updating non-default location to default if one exists', async () => {
      await InventoryService.createLocation({
        code: 'SVC-DEF-A',
        name: 'Service Default A',
        isDefault: true
      });

      const second = await InventoryService.createLocation({
        code: 'SVC-DEF-B',
        name: 'Service Default B',
        isDefault: false
      });

      await expect(
        InventoryService.updateLocation(second.id, {
          isDefault: true
        })
      ).rejects.toThrowError(ConflictError);
    });
  });
});
