/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { ConflictError, ValidationError } from '../../src/lib/errors';
import { Prisma } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.2 — Inventory Availability Service', () => {
  let location: any;
  let category: any;
  let product: any;
  let variant: any;

  beforeAll(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    category = await prisma.category.create({ data: { name: 'Availability Test Cat' } });
    product = await prisma.product.create({
      data: { name: 'Availability Test Product', categoryId: category.id, isActive: true }
    });
    variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'AVAIL-01', sellingPrice: 500, isActive: true }
    });
    location = await prisma.inventoryLocation.create({
      data: { code: 'AVAIL-LOC-01', name: 'Availability Test Location' }
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

  // 1. Availability is correctly calculated when no stock is reserved
  it('1. correctly calculates available quantity when no stock is reserved', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 15,
        reserved: 0
      }
    });

    const result = await InventoryService.checkAvailability(variant.id, location.id, 10);
    expect(result.hasBalance).toBe(true);
    expect(result.onHandQuantity).toBe('15');
    expect(result.reservedQuantity).toBe('0');
    expect(result.availableQuantity).toBe('15');
    expect(result.requestedQuantity).toBe('10');
    expect(result.isAvailable).toBe(true);
  });

  // 2. Availability is correctly calculated when a reserved quantity exists
  it('2. correctly calculates available quantity when a reserved quantity exists (quantity - reserved)', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 20,
        reserved: 5
      }
    });

    // Available is 20 - 5 = 15. Requesting 15 should be available
    const res15 = await InventoryService.checkAvailability(variant.id, location.id, 15);
    expect(res15.availableQuantity).toBe('15');
    expect(res15.isAvailable).toBe(true);

    // Requesting 16 should be unavailable
    const res16 = await InventoryService.checkAvailability(variant.id, location.id, 16);
    expect(res16.availableQuantity).toBe('15');
    expect(res16.isAvailable).toBe(false);
  });

  // 3. A missing balance is handled safely
  it('3. safely handles a non-existent inventory balance without assuming stock exists', async () => {
    const nonExistentVariantId = '00000000-0000-0000-0000-000000000001';
    const result = await InventoryService.checkAvailability(nonExistentVariantId, location.id, 1);

    expect(result.hasBalance).toBe(false);
    expect(result.onHandQuantity).toBe('0');
    expect(result.reservedQuantity).toBe('0');
    expect(result.availableQuantity).toBe('0');
    expect(result.isAvailable).toBe(false);
  });

  // 4. Insufficient stock is reported accurately
  it('4. accurately reports isAvailable = false when requested quantity exceeds available stock', async () => {
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 3,
        reserved: 1
      }
    });

    const result = await InventoryService.checkAvailability(variant.id, location.id, 5);
    expect(result.availableQuantity).toBe('2');
    expect(result.requestedQuantity).toBe('5');
    expect(result.isAvailable).toBe(false);
  });

  // 5. Invalid and non-positive quantities are rejected
  it('5. rejects invalid, zero, and negative requested quantities with ValidationError', async () => {
    await expect(InventoryService.checkAvailability(variant.id, location.id, 0)).rejects.toThrowError(ValidationError);
    await expect(InventoryService.checkAvailability(variant.id, location.id, -5)).rejects.toThrowError(ValidationError);
    await expect(InventoryService.checkAvailability(variant.id, location.id, 'not-a-number' as any)).rejects.toThrowError(
      ValidationError
    );
    await expect(InventoryService.checkAvailability(variant.id, location.id, null as any)).rejects.toThrowError(ValidationError);
  });

  // 6. Negative or inconsistent available stock is detected
  it('6. detects inconsistent database balances (negative on-hand or reserved > quantity) and fails safely', async () => {
    // Inject inconsistent balance directly: quantity = 5, reserved = 10 (available = -5)
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 5,
        reserved: 10
      }
    });

    await expect(InventoryService.checkAvailability(variant.id, location.id, 2)).rejects.toThrowError(ConflictError);
  });

  // 7. Decimal quantities are handled without floating-point drift
  it('7. preserves exact decimal precision without IEEE-754 floating-point drift', async () => {
    // 0.1 + 0.2 in JS float is 0.30000000000000004
    await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: new Prisma.Decimal('0.300'),
        reserved: new Prisma.Decimal('0.100')
      }
    });

    const result = await InventoryService.checkAvailability(variant.id, location.id, '0.200');
    expect(result.onHandQuantity).toBe('0.3');
    expect(result.reservedQuantity).toBe('0.1');
    expect(result.availableQuantity).toBe('0.2');
    expect(result.requestedQuantity).toBe('0.2');
    expect(result.isAvailable).toBe(true);

    const resultSlightlyMore = await InventoryService.checkAvailability(variant.id, location.id, '0.201');
    expect(resultSlightlyMore.isAvailable).toBe(false);
  });

  // 8. Availability checks do not mutate balances or create movements
  it('8. ensures availability checks are strictly read-only: no balance mutation and no movements created', async () => {
    const initialBalance = await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 100,
        reserved: 10
      }
    });

    const initialMovementCount = await prisma.stockMovement.count();

    // Call checkAvailability multiple times
    await InventoryService.checkAvailability(variant.id, location.id, 50);
    await InventoryService.checkAvailability(variant.id, location.id, 200);

    // Call checkMultipleAvailability
    await InventoryService.checkMultipleAvailability([
      { variantId: variant.id, locationId: location.id, quantity: 20 },
      { variantId: variant.id, locationId: location.id, quantity: 150 }
    ]);

    // Verify balance is completely untouched
    const balanceAfter = await prisma.inventoryBalance.findUnique({
      where: { id: initialBalance.id }
    });
    expect(balanceAfter?.quantity.toNumber()).toBe(100);
    expect(balanceAfter?.reserved.toNumber()).toBe(10);

    // Verify movements count is unchanged
    const movementCountAfter = await prisma.stockMovement.count();
    expect(movementCountAfter).toBe(initialMovementCount);
  });

  // Multi-item availability check
  it('supports checking availability across multiple items with aggregation', async () => {
    const variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'AVAIL-02', sellingPrice: 600, isActive: true }
    });

    await prisma.inventoryBalance.create({
      data: { variantId: variant.id, locationId: location.id, quantity: 10, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: location.id, quantity: 5, reserved: 0 }
    });

    // Requesting variant 1 twice (4 + 5 = 9 <= 10) and variant 2 (3 <= 5) -> all available
    const multiResultAll = await InventoryService.checkMultipleAvailability([
      { variantId: variant.id, locationId: location.id, quantity: 4 },
      { variantId: variant.id, locationId: location.id, quantity: 5 },
      { variantId: variant2.id, locationId: location.id, quantity: 3 }
    ]);
    expect(multiResultAll.isAllAvailable).toBe(true);
    expect(multiResultAll.items).toHaveLength(2); // aggregated to 2 unique items

    // Requesting variant 1 twice (6 + 5 = 11 > 10) -> not all available
    const multiResultShort = await InventoryService.checkMultipleAvailability([
      { variantId: variant.id, locationId: location.id, quantity: 6 },
      { variantId: variant.id, locationId: location.id, quantity: 5 },
      { variantId: variant2.id, locationId: location.id, quantity: 3 }
    ]);
    expect(multiResultShort.isAllAvailable).toBe(false);
  });
});
