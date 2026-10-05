/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { InsufficientStockError } from '../../src/lib/errors';
import { MovementType } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.2 — Transactional Deduction Primitive', () => {
  let locationA: any;
  let locationB: any;
  let category: any;
  let product: any;
  let variant1: any;
  let variant2: any;
  let user: any;

  beforeAll(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    user = await prisma.user.upsert({
      where: { email: 'deduct-test@test.com' },
      update: {},
      create: {
        id: 'user-deduct-test',
        email: 'deduct-test@test.com',
        name: 'Deduct Tester',
        role: 'OWNER',
        passwordHash: 'dummy'
      }
    });

    category = await prisma.category.create({ data: { name: 'Deduction Cat' } });
    product = await prisma.product.create({
      data: { name: 'Deduction Product', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'DEDUCT-01', sellingPrice: 100, isActive: true }
    });
    variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'DEDUCT-02', sellingPrice: 200, isActive: true }
    });

    locationA = await prisma.inventoryLocation.create({
      data: { code: 'DEDUCT-LOC-A', name: 'Location A' }
    });
    locationB = await prisma.inventoryLocation.create({
      data: { code: 'DEDUCT-LOC-B', name: 'Location B' }
    });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  });

  beforeEach(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  // 1. A valid deduction updates the correct balance
  it('1. updates the correct balance on valid deduction', async () => {
    const initialBalance = await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 50,
        reserved: 5
      }
    });

    const result = await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 15,
      reference: 'REF-001',
      reason: 'Sale test',
      userId: user.id
    });

    expect(result.deductedQuantity).toBe('15');
    expect(result.remainingQuantity).toBe('35');

    const updated = await prisma.inventoryBalance.findUnique({
      where: { id: initialBalance.id }
    });
    expect(updated?.quantity.toNumber()).toBe(35);
    expect(updated?.reserved.toNumber()).toBe(5);
  });

  // 2. A valid deduction creates exactly one corresponding movement
  it('2. creates exactly one corresponding StockMovement with ISSUE type and ledger details', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 20,
        reserved: 0
      }
    });

    const result = await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 8,
      reference: 'INV-TEST-002',
      reason: 'Bill issuance deduction',
      userId: user.id,
      idempotencyKey: 'idem-test-002'
    });

    expect(result.movement).toBeDefined();
    expect(result.movement.id).toBeDefined();
    expect(result.movement.quantity).toBe(8);

    const movements = await prisma.stockMovement.findMany({
      where: { locationId: locationA.id, variantId: variant1.id }
    });
    expect(movements).toHaveLength(1);
    const movement = movements[0]!;
    expect(movement.type).toBe(MovementType.ISSUE);
    expect(movement.quantity.toNumber()).toBe(8);
    expect(movement.reference).toBe('INV-TEST-002');
    expect(movement.reason).toBe('Bill issuance deduction');
    expect(movement.userId).toBe(user.id);
    expect(movement.idempotencyKey).toBe('idem-test-002');
  });

  // 3. A deduction that would exceed available stock fails without mutation
  it('3. rejects deduction exceeding available stock with InsufficientStockError and leaves balance untouched', async () => {
    const initialBalance = await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 10,
        reserved: 4 // Available is 10 - 4 = 6
      }
    });

    // Requesting 7 exceeds available 6
    await expect(
      InventoryService.deductStock({
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 7,
        userId: user.id
      })
    ).rejects.toThrowError(InsufficientStockError);

    // Balance must remain unchanged
    const balanceAfter = await prisma.inventoryBalance.findUnique({
      where: { id: initialBalance.id }
    });
    expect(balanceAfter?.quantity.toNumber()).toBe(10);

    // Zero movements created
    const count = await prisma.stockMovement.count();
    expect(count).toBe(0);
  });

  // 4. A missing balance fails safely
  it('4. fails safely with InsufficientStockError when no balance exists', async () => {
    await expect(
      InventoryService.deductStock({
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 1,
        userId: user.id
      })
    ).rejects.toThrowError(InsufficientStockError);

    const count = await prisma.stockMovement.count();
    expect(count).toBe(0);
  });

  // 5. A transaction failure rolls back both balance and movement
  it('5. rolls back both balance and movement mutations if transaction fails', async () => {
    const initialBalance = await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 30,
        reserved: 0
      }
    });

    // Execute within a caller transaction that deliberately fails after deduction
    await expect(
      prisma.$transaction(async (tx) => {
        await InventoryService.deductStock(
          {
            variantId: variant1.id,
            locationId: locationA.id,
            quantity: 10,
            userId: user.id
          },
          tx
        );

        // Simulated subsequent failure in transaction
        throw new Error('Simulated caller failure');
      })
    ).rejects.toThrow('Simulated caller failure');

    // Verify balance rolled back to 30
    const balanceAfter = await prisma.inventoryBalance.findUnique({
      where: { id: initialBalance.id }
    });
    expect(balanceAfter?.quantity.toNumber()).toBe(30);

    // Verify no movement was committed
    const movements = await prisma.stockMovement.count();
    expect(movements).toBe(0);
  });

  // 6. Duplicate idempotency requests do not deduct twice
  it('6. prevents duplicate deductions when replaying with the same idempotencyKey', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 50,
        reserved: 0
      }
    });

    const key = 'idempotent-deduct-006';

    const res1 = await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 10,
      idempotencyKey: key,
      userId: user.id
    });
    expect(res1.remainingQuantity).toBe('40');

    // Duplicate call with same idempotency key
    const res2 = await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 10,
      idempotencyKey: key,
      userId: user.id
    });

    // Replay returns identical movement and current balance without re-deducting
    expect(res2.movement.id).toBe(res1.movement.id);

    const balanceAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(balanceAfter?.quantity.toNumber()).toBe(40); // NOT 30!

    const movements = await prisma.stockMovement.findMany({
      where: { idempotencyKey: key }
    });
    expect(movements).toHaveLength(1);
  });

  // 7. Repeated variants in a multi-item request are aggregated correctly
  it('7. aggregates repeated variants in a multi-item request before checking availability and deducting', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 20,
        reserved: 0
      }
    });

    // Requesting variant1 in two separate lines: 6 + 9 = 15 <= 20
    const result = await InventoryService.deductMultipleStock({
      locationId: locationA.id,
      items: [
        { variantId: variant1.id, quantity: 6 },
        { variantId: variant1.id, quantity: 9 }
      ],
      userId: user.id
    });

    expect(result.deductions).toHaveLength(1); // Aggregated to 1 unique variant
    expect(result.deductions[0]!.deductedQuantity).toBe('15');
    expect(result.deductions[0]!.remainingQuantity).toBe('5');

    const balanceAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(balanceAfter?.quantity.toNumber()).toBe(5);

    // If lines sum to exceed stock (e.g. 3 + 3 = 6 > 5):
    await expect(
      InventoryService.deductMultipleStock({
        locationId: locationA.id,
        items: [
          { variantId: variant1.id, quantity: 3 },
          { variantId: variant1.id, quantity: 3 }
        ],
        userId: user.id
      })
    ).rejects.toThrowError(InsufficientStockError);

    // Balance remains 5
    const finalBalance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(finalBalance?.quantity.toNumber()).toBe(5);
  });

  // 8. A shortage in any item rolls back the entire multi-item deduction
  it('8. rolls back all items if any single item suffers a stock shortage', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 50,
        reserved: 0
      }
    });
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant2.id,
        locationId: locationA.id,
        quantity: 5, // Short!
        reserved: 0
      }
    });

    // Requesting 10 of variant1 (available) and 10 of variant2 (NOT available)
    await expect(
      InventoryService.deductMultipleStock({
        locationId: locationA.id,
        items: [
          { variantId: variant1.id, quantity: 10 },
          { variantId: variant2.id, quantity: 10 }
        ],
        userId: user.id
      })
    ).rejects.toThrowError(InsufficientStockError);

    // Variant 1 must NOT have been deducted
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(bal1?.quantity.toNumber()).toBe(50);

    // Variant 2 must NOT have been deducted
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: locationA.id } }
    });
    expect(bal2?.quantity.toNumber()).toBe(5);

    // Zero movements created
    const movements = await prisma.stockMovement.count();
    expect(movements).toBe(0);
  });

  // 9. Deductions at separate locations do not affect each other's balances
  it('9. isolates deductions between separate locations', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 100,
        reserved: 0
      }
    });
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant1.id,
        locationId: locationB.id,
        quantity: 100,
        reserved: 0
      }
    });

    // Deduct 25 from Location A
    await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 25,
      userId: user.id
    });

    // Location A should be 75
    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(balA?.quantity.toNumber()).toBe(75);

    // Location B must remain strictly 100
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balB?.quantity.toNumber()).toBe(100);
  });

  // 10. Multi-item idempotent replay accurately reproduces all deductions without modifying balances
  it('10. replays multi-item deductions idempotently with accurate items and unchanged balances', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 30, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: locationA.id, quantity: 40, reserved: 0 }
    });

    const firstRun = await InventoryService.deductMultipleStock({
      locationId: locationA.id,
      items: [
        { variantId: variant1.id, quantity: 10 },
        { variantId: variant2.id, quantity: 15 }
      ],
      userId: user.id,
      idempotencyKey: 'idem-multi-replay'
    });

    expect(firstRun.deductions).toHaveLength(2);
    expect(firstRun.deductions.find(d => d.movement.variantId === variant1.id)?.deductedQuantity).toBe('10');
    expect(firstRun.deductions.find(d => d.movement.variantId === variant2.id)?.deductedQuantity).toBe('15');

    // Second run with identical idempotencyKey
    const secondRun = await InventoryService.deductMultipleStock({
      locationId: locationA.id,
      items: [
        { variantId: variant1.id, quantity: 10 },
        { variantId: variant2.id, quantity: 15 }
      ],
      userId: user.id,
      idempotencyKey: 'idem-multi-replay'
    });

    expect(secondRun.deductions).toHaveLength(2);
    expect(secondRun.deductions.find(d => d.movement.variantId === variant1.id)?.deductedQuantity).toBe('10');
    expect(secondRun.deductions.find(d => d.movement.variantId === variant2.id)?.deductedQuantity).toBe('15');

    // Balances must remain at 20 and 25 (only one deduction occurred)
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(bal1?.quantity.toNumber()).toBe(20);

    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: locationA.id } }
    });
    expect(bal2?.quantity.toNumber()).toBe(25);

    // Ledger must contain exactly 2 movements
    const movements = await prisma.stockMovement.findMany({ where: { locationId: locationA.id } });
    expect(movements).toHaveLength(2);
  });

  // 11. External transaction idempotency pre-check leaves transaction healthy and permits caller commits
  it('11. leaves caller transaction healthy and committable on idempotent replay', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });

    // Initial deduction committed
    await InventoryService.deductStock({
      variantId: variant1.id,
      locationId: locationA.id,
      quantity: 10,
      userId: user.id,
      idempotencyKey: 'idem-ext-healthy'
    });

    // Caller opens their own transaction and replays the same key
    let replayResult: any;
    await prisma.$transaction(async (tx) => {
      replayResult = await InventoryService.deductStock(
        {
          variantId: variant1.id,
          locationId: locationA.id,
          quantity: 10,
          userId: user.id,
          idempotencyKey: 'idem-ext-healthy'
        },
        tx
      );

      // Caller performs another operation in the same transaction to confirm it is NOT aborted
      await tx.category.create({
        data: { name: 'ExtTx Category Confirmation' }
      });
    });

    expect(replayResult.deductedQuantity).toBe('10');
    expect(replayResult.remainingQuantity).toBe('40');

    // Confirmation category was committed
    const confirmedCat = await prisma.category.findFirst({
      where: { name: 'ExtTx Category Confirmation' }
    });
    expect(confirmedCat).toBeDefined();

    // Balance remains 40 (not deducted again)
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(bal?.quantity.toNumber()).toBe(40);
  });

  // 12. issueStock backward compatibility regression suite
  describe('12. issueStock Backward Compatibility', () => {
    it('issues stock, reduces balance, creates movement, and handles fractional quantities', async () => {
      await prisma.inventoryBalance.create({
        data: { variantId: variant1.id, locationId: locationA.id, quantity: 20, reserved: 0 }
      });

      const res = await InventoryService.issueStock({
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 3.75,
        reference: 'ISSUE-COMPAT-01',
        reason: 'Sample delivery',
        userId: user.id,
        idempotencyKey: 'issue-compat-key-1'
      });

      expect(res.movement).toBeDefined();
      expect(res.movement.quantity).toBe(3.75);
      expect(res.movement.type).toBe(MovementType.ISSUE);

      const bal = await prisma.inventoryBalance.findUnique({
        where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
      });
      expect(bal?.quantity.toNumber()).toBe(16.25);

      // Idempotent replay of issueStock returns the same movement
      const replay = await InventoryService.issueStock({
        variantId: variant1.id,
        locationId: locationA.id,
        quantity: 3.75,
        reference: 'ISSUE-COMPAT-01',
        reason: 'Sample delivery',
        userId: user.id,
        idempotencyKey: 'issue-compat-key-1'
      });
      expect(replay.movement.id).toBe(res.movement.id);

      // Over-issue throws InsufficientStockError
      await expect(
        InventoryService.issueStock({
          variantId: variant1.id,
          locationId: locationA.id,
          quantity: 50,
          reference: 'OVER-ISSUE'
        })
      ).rejects.toThrowError(InsufficientStockError);
    });

    it('propagates caller-supplied transaction client in issueStock', async () => {
      await prisma.inventoryBalance.create({
        data: { variantId: variant1.id, locationId: locationA.id, quantity: 30, reserved: 0 }
      });

      await prisma.$transaction(async (tx) => {
        await InventoryService.issueStock(
          {
            variantId: variant1.id,
            locationId: locationA.id,
            quantity: 5,
            reference: 'TX-ISSUE-01'
          },
          tx
        );
      });

      const bal = await prisma.inventoryBalance.findUnique({
        where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
      });
      expect(bal?.quantity.toNumber()).toBe(25);
    });
  });
});
