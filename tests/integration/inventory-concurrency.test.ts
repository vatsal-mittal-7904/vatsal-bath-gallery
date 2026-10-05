/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import {
  InventoryService,
  __setInventoryTestHook,
  isRetryableDbError
} from '../../src/features/inventory/inventory.service';
import { InsufficientStockError, ConflictError } from '../../src/lib/errors';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.2 — Real PostgreSQL Inventory Concurrency Tests', () => {
  let location: any;
  let category: any;
  let product: any;
  let variantA: any;
  let variantB: any;
  let variantC: any;
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
      where: { email: 'conc-test@test.com' },
      update: {},
      create: {
        id: 'user-conc-test',
        email: 'conc-test@test.com',
        name: 'Concurrency Tester',
        role: 'OWNER',
        passwordHash: 'dummy'
      }
    });

    category = await prisma.category.create({ data: { name: 'Concurrency Cat' } });
    product = await prisma.product.create({
      data: { name: 'Concurrency Product', categoryId: category.id, isActive: true }
    });
    variantA = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CONC-A', sellingPrice: 100, isActive: true }
    });
    variantB = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CONC-B', sellingPrice: 200, isActive: true }
    });
    variantC = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CONC-C', sellingPrice: 300, isActive: true }
    });

    location = await prisma.inventoryLocation.create({
      data: { code: 'CONC-LOC-01', name: 'Concurrency Test Warehouse' }
    });
  });

  afterAll(async () => {
    __setInventoryTestHook(null);
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  });

  beforeEach(async () => {
    __setInventoryTestHook(null);
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  afterEach(() => {
    __setInventoryTestHook(null);
  });

  // 1. Two concurrent deductions competing for the same remaining stock cannot oversell
  it('1. prevents overselling when two concurrent deductions compete for the same stock', async () => {
    // Initial stock is exactly 10
    await prisma.inventoryBalance.create({
      data: {
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        reserved: 0
      }
    });

    // Launch two simultaneous deductions of 10 each
    const results = await Promise.allSettled([
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        reference: 'RACE-1',
        userId: user.id
      }),
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        reference: 'RACE-2',
        userId: user.id
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one deduction must succeed, and exactly one must fail with InsufficientStockError
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    // Final balance must be exactly 0 (NOT negative!)
    const finalBalance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(finalBalance?.quantity.toNumber()).toBe(0);

    // Exactly one movement must be recorded in the ledger
    const movements = await prisma.stockMovement.findMany({
      where: { locationId: location.id, variantId: variantA.id }
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.quantity.toNumber()).toBe(10);
  });

  // 2. Concurrent deductions with sufficient combined stock both succeed, and final balances are correct
  it('2. allows concurrent deductions when combined stock is sufficient and computes correct final balance', async () => {
    // Initial stock is 25 units
    await prisma.inventoryBalance.create({
      data: {
        variantId: variantA.id,
        locationId: location.id,
        quantity: 25,
        reserved: 0
      }
    });

    // Fire 3 concurrent deductions: 10, 8, 7 = 25 total
    const [res1, res2, res3] = await Promise.all([
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        reference: 'CONC-SUFF-1',
        userId: user.id
      }),
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 8,
        reference: 'CONC-SUFF-2',
        userId: user.id
      }),
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 7,
        reference: 'CONC-SUFF-3',
        userId: user.id
      })
    ]);

    expect(res1.movement.id).toBeDefined();
    expect(res2.movement.id).toBeDefined();
    expect(res3.movement.id).toBeDefined();

    // Final balance must be 25 - (10 + 8 + 7) = 0
    const finalBalance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(finalBalance?.quantity.toNumber()).toBe(0);

    // Exactly 3 movements in ledger
    const movements = await prisma.stockMovement.findMany({
      where: { locationId: location.id, variantId: variantA.id }
    });
    expect(movements).toHaveLength(3);
  });

  // 3. Concurrent duplicate idempotency requests do not result in duplicate deductions
  it('3. ensures concurrent duplicate idempotency requests result in exactly one deduction', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variantA.id,
        locationId: location.id,
        quantity: 50,
        reserved: 0
      }
    });

    const sharedKey = 'shared-race-idem-key-003';

    // Race two simultaneous requests using the SAME idempotency key
    const [res1, res2] = await Promise.all([
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        idempotencyKey: sharedKey,
        userId: user.id
      }),
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        idempotencyKey: sharedKey,
        userId: user.id
      })
    ]);

    // Both resolve to the same movement
    expect(res1.movement.id).toBe(res2.movement.id);

    // Stock must have been deducted exactly ONCE: 50 - 10 = 40 (NOT 30!)
    const finalBalance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(finalBalance?.quantity.toNumber()).toBe(40);

    // Exactly 1 movement exists
    const movements = await prisma.stockMovement.findMany({
      where: { idempotencyKey: sharedKey }
    });
    expect(movements).toHaveLength(1);
  });

  // 4. Multi-item deductions acquire locks deterministically
  it('4. acquires locks deterministically when competing transactions touch items in opposite order', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 20, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantB.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    // Request 1: [variantA, variantB]
    // Request 2: [variantB, variantA]
    // Use deterministic test hook to force Transaction 1 to hold its locks while Transaction 2 attempts to lock
    let tx1Locked = false;
    let resolveTx1Continue: () => void;
    const tx1ContinuePromise = new Promise<void>(resolve => {
      resolveTx1Continue = resolve;
    });

    __setInventoryTestHook(async (stage) => {
      if (stage === 'after_balance_lock' && !tx1Locked) {
        tx1Locked = true;
        // Pause Tx1 holding the lock until Tx2 has launched and blocked on the lock
        await tx1ContinuePromise;
      }
    });

    const tx1Promise = InventoryService.deductMultipleStock({
      locationId: location.id,
      items: [
        { variantId: variantA.id, quantity: 5 },
        { variantId: variantB.id, quantity: 5 }
      ],
      userId: user.id
    });

    // Wait until Tx 1 acquires the lock
    while (!tx1Locked) {
      await new Promise(r => setImmediate(r));
    }

    // Now start Tx 2 with opposite order: [variantB, variantA]
    const tx2Promise = InventoryService.deductMultipleStock({
      locationId: location.id,
      items: [
        { variantId: variantB.id, quantity: 5 },
        { variantId: variantA.id, quantity: 5 }
      ],
      userId: user.id
    });

    // Let Tx 2 reach the lock contention point, then release Tx 1
    await new Promise(r => setTimeout(r, 50));
    resolveTx1Continue!();

    const [res1, res2] = await Promise.all([tx1Promise, tx2Promise]);

    expect(res1.deductions).toHaveLength(2);
    expect(res2.deductions).toHaveLength(2);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(balA?.quantity.toNumber()).toBe(10);

    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantB.id, locationId: location.id } }
    });
    expect(balB?.quantity.toNumber()).toBe(10);
  });

  // 5. Competing multi-item operations do not produce partial commits
  it('5. prevents partial commits when competing multi-item operations contend for shared stock', async () => {
    // Initial Stock:
    // variantA: 10
    // variantB: 5 (Contended bottleneck!)
    // variantC: 10
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 10, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantB.id, locationId: location.id, quantity: 5, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantC.id, locationId: location.id, quantity: 10, reserved: 0 }
    });

    // Tx1 needs [variantA: 5, variantB: 5]
    // Tx2 needs [variantB: 5, variantC: 5]
    // Since variantB has only 5 available, exactly one operation can succeed.
    // The losing operation MUST NOT commit any partial deduction to variantA or variantC.
    const results = await Promise.allSettled([
      InventoryService.deductMultipleStock({
        locationId: location.id,
        items: [
          { variantId: variantA.id, quantity: 5 },
          { variantId: variantB.id, quantity: 5 }
        ],
        reference: 'TX-1',
        userId: user.id
      }),
      InventoryService.deductMultipleStock({
        locationId: location.id,
        items: [
          { variantId: variantB.id, quantity: 5 },
          { variantId: variantC.id, quantity: 5 }
        ],
        reference: 'TX-2',
        userId: user.id
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    // Contended variantB must be 0
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantB.id, locationId: location.id } }
    });
    expect(balB?.quantity.toNumber()).toBe(0);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    const balC = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantC.id, locationId: location.id } }
    });

    // Exactly one of A or C was deducted by 5; the other remains untouched at 10
    const aDeducted = balA?.quantity.toNumber() === 5;
    const cDeducted = balC?.quantity.toNumber() === 5;
    expect(aDeducted !== cDeducted).toBe(true);
    expect((balA?.quantity.toNumber() ?? 0) + (balC?.quantity.toNumber() ?? 0)).toBe(15);

    // Exactly 2 movements in the ledger (1 for B, and 1 for whichever of A or C won)
    const movements = await prisma.stockMovement.findMany();
    expect(movements).toHaveLength(2);
  });

  // 6. Transaction rollback preserves balance and ledger consistency
  it('6. preserves balance and ledger consistency when an unhandled error triggers transaction rollback', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variantA.id,
        locationId: location.id,
        quantity: 50,
        reserved: 0
      }
    });

    // Install test hook to simulate failure immediately after balance row lock
    __setInventoryTestHook(async (stage) => {
      if (stage === 'after_balance_lock') {
        throw new Error('Simulated network crash during lock');
      }
    });

    await expect(
      InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 10,
        userId: user.id
      })
    ).rejects.toThrow('Simulated network crash during lock');

    // Balance must remain unchanged at 50
    const balance = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(balance?.quantity.toNumber()).toBe(50);

    // Zero movements recorded
    const movementCount = await prisma.stockMovement.count();
    expect(movementCount).toBe(0);
  });

  // 7. Deadlock or serialization failures are handled according to the repository's established retry policy
  describe('7. Retry Classification and Policy Verification', () => {
    it('correctly classifies PostgreSQL 40P01, 40001, and Prisma P2034 as retryable', () => {
      expect(isRetryableDbError({ code: '40P01' })).toBe(true);
      expect(isRetryableDbError({ code: '40001' })).toBe(true);
      expect(isRetryableDbError({ code: 'P2034' })).toBe(true);
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
      expect(isRetryableDbError({ code: 'P2010', meta: { code: '40001' } })).toBe(true);

      // Non-retryable
      expect(isRetryableDbError({ code: 'P2002' })).toBe(false); // Unique constraint
      expect(isRetryableDbError({ code: 'P2003' })).toBe(false); // Foreign key
      expect(isRetryableDbError({ code: 'P2025' })).toBe(false); // Record not found
      expect(isRetryableDbError(new Error('Domain error'))).toBe(false);
      expect(isRetryableDbError(null)).toBe(false);
    });

    it('recovers and succeeds when a transient retryable conflict occurs on the first attempt', async () => {
      await prisma.inventoryBalance.create({
        data: {
          variantId: variantA.id,
          locationId: location.id,
          quantity: 20,
          reserved: 0
        }
      });

      let attempts = 0;
      __setInventoryTestHook(async (stage) => {
        if (stage === 'after_balance_lock') {
          attempts++;
          if (attempts === 1) {
            // Simulate transient deadlock error on first attempt
            const err: any = new Error('deadlock detected');
            err.code = '40P01';
            throw err;
          }
        }
      });

      const result = await InventoryService.deductStock({
        variantId: variantA.id,
        locationId: location.id,
        quantity: 5,
        userId: user.id
      });

      expect(result.remainingQuantity).toBe('15');
      expect(attempts).toBe(2); // Attempt 1 failed with 40P01, Attempt 2 succeeded!

      const balance = await prisma.inventoryBalance.findUnique({
        where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
      });
      expect(balance?.quantity.toNumber()).toBe(15);

      const movements = await prisma.stockMovement.findMany();
      expect(movements).toHaveLength(1);
    });
  });

  // 8. Concurrent multi-item duplicate requests in internally managed transactions
  it('8. ensures concurrent multi-item duplicate requests result in exactly one deduction and both receive full results', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 20, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variantB.id, locationId: location.id, quantity: 30, reserved: 0 }
    });

    const [res1, res2] = await Promise.all([
      InventoryService.deductMultipleStock({
        locationId: location.id,
        items: [
          { variantId: variantA.id, quantity: 5 },
          { variantId: variantB.id, quantity: 10 }
        ],
        userId: user.id,
        idempotencyKey: 'idem-multi-race'
      }),
      InventoryService.deductMultipleStock({
        locationId: location.id,
        items: [
          { variantId: variantA.id, quantity: 5 },
          { variantId: variantB.id, quantity: 10 }
        ],
        userId: user.id,
        idempotencyKey: 'idem-multi-race'
      })
    ]);

    expect(res1.deductions).toHaveLength(2);
    expect(res2.deductions).toHaveLength(2);

    // Balances must reflect only ONE deduction
    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(balA?.quantity.toNumber()).toBe(15);

    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantB.id, locationId: location.id } }
    });
    expect(balB?.quantity.toNumber()).toBe(20);

    // Exactly 2 movements in the ledger (1 for A, 1 for B)
    const movements = await prisma.stockMovement.findMany({ where: { locationId: location.id } });
    expect(movements).toHaveLength(2);
  });

  // 9. Concurrent duplicate requests in caller-provided external transactions
  it('9. rejects concurrent duplicate in external transaction with ConflictError without attempting aborted queries', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variantA.id, locationId: location.id, quantity: 20, reserved: 0 }
    });

    let tx1Committed = false;
    let resolveTx1Commit: () => void;
    const tx1CommitPromise = new Promise<void>(resolve => {
      resolveTx1Commit = resolve;
    });

    // Run Tx 1
    const p1 = prisma.$transaction(async (tx) => {
      const res = await InventoryService.deductStock(
        {
          variantId: variantA.id,
          locationId: location.id,
          quantity: 5,
          userId: user.id,
          idempotencyKey: 'idem-ext-race'
        },
        tx
      );
      // Wait for Tx 2 to attempt deduction before committing Tx 1
      await tx1CommitPromise;
      tx1Committed = true;
      return res;
    });

    // Small delay to ensure Tx 1 enters and locks
    await new Promise(r => setTimeout(r, 20));

    // Run Tx 2 concurrently with the exact same idempotencyKey
    const p2 = prisma.$transaction(async (tx) => {
      // Release Tx 1 to commit as Tx 2 executes
      resolveTx1Commit!();
      return await InventoryService.deductStock(
        {
          variantId: variantA.id,
          locationId: location.id,
          quantity: 5,
          userId: user.id,
          idempotencyKey: 'idem-ext-race'
        },
        tx
      );
    });

    // Tx 1 must succeed
    const res1 = await p1;
    expect(res1.deductedQuantity).toBe('5');
    expect(tx1Committed).toBe(true);

    // Tx 2 must either be caught in pre-check (if Tx 1 committed first) or fail with ConflictError on concurrent insertion race
    // If it raced on insert, ConflictError is thrown indicating the transaction was aborted
    try {
      const res2 = await p2;
      // If Tx 2 arrived after Tx 1 committed, it safely got the replay
      expect(res2.deductedQuantity).toBe('5');
    } catch (err: any) {
      // If Tx 2 collided on insert, it threw ConflictError cleanly
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toContain('idempotency key');
    }

    // Final balance is exactly 15 (deducted exactly once)
    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variantA.id, locationId: location.id } }
    });
    expect(balA?.quantity.toNumber()).toBe(15);

    const movements = await prisma.stockMovement.findMany({ where: { locationId: location.id } });
    expect(movements).toHaveLength(1);
  });
});
