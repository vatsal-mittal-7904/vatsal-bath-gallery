import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe('Inventory Database Models', () => {
  beforeAll(async () => {
    if (!isTestDb) {
      await prisma.stockMovement.deleteMany();
      await prisma.stockTransfer.deleteMany();
      await prisma.inventoryBalance.deleteMany();
      await prisma.inventoryLocation.deleteMany();
      await prisma.productVariant.deleteMany();
      await prisma.product.deleteMany();
      await prisma.category.deleteMany();
    }
  });

  afterAll(async () => {
    if (!isTestDb) {
      await prisma.stockMovement.deleteMany();
      await prisma.stockTransfer.deleteMany();
      await prisma.inventoryBalance.deleteMany();
      await prisma.inventoryLocation.deleteMany();
      await prisma.productVariant.deleteMany();
      await prisma.product.deleteMany();
      await prisma.category.deleteMany();
    }
  });

  it.skipIf(isTestDb)('can create inventory location and enforce unique code', async () => {
    const loc1 = await prisma.inventoryLocation.create({
      data: { code: 'WH-01', name: 'Main Warehouse' }
    });
    expect(loc1.id).toBeDefined();

    await expect(prisma.inventoryLocation.create({
      data: { code: 'WH-01', name: 'Duplicate Code' }
    })).rejects.toThrow(/Unique constraint failed on the fields: \\(\`code\`\\)/);
  });

  it.skipIf(isTestDb)('enforces unique balance per variant per location', async () => {
    const category = await prisma.category.create({ data: { name: 'Pipes' }});
    const product = await prisma.product.create({ data: { name: 'PVC Pipe', categoryId: category.id }});
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'PVC-001',
        sellingPrice: 15.5
      }
    });

    const location = await prisma.inventoryLocation.create({
      data: { code: 'SH-01', name: 'Shop Front' }
    });

    // Create balance
    const balance = await prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 100.5, // Testing fractional (Decimal)
      }
    });
    
    expect(balance.id).toBeDefined();
    expect(balance.quantity.toNumber()).toBe(100.5);

    // Duplicate balance should fail
    await expect(prisma.inventoryBalance.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        quantity: 50,
      }
    })).rejects.toThrow(/Unique constraint failed/);

    // Creating movement
    const movement = await prisma.stockMovement.create({
      data: {
        variantId: variant.id,
        locationId: location.id,
        type: 'RECEIPT',
        quantity: 100.5,
        reason: 'Initial load'
      }
    });
    expect(movement.id).toBeDefined();

    // Restrict deletion check: Try deleting variant, should fail because balance & movement depend on it
    await expect(prisma.productVariant.delete({
      where: { id: variant.id }
    })).rejects.toThrow(/Foreign key constraint failed/);
  });

  it.skipIf(isTestDb)('can support transfers between locations', async () => {
    const locA = await prisma.inventoryLocation.create({ data: { code: 'WH-A', name: 'Warehouse A' }});
    const locB = await prisma.inventoryLocation.create({ data: { code: 'WH-B', name: 'Warehouse B' }});

    const transfer = await prisma.stockTransfer.create({
      data: {
        sourceId: locA.id,
        destinationId: locB.id,
        status: 'PENDING',
        reference: 'TR-100'
      }
    });
    
    expect(transfer.id).toBeDefined();
    expect(transfer.status).toBe('PENDING');
  });
});
