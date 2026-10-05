import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

describe('Inventory Database Models', () => {
  const cleanup = async () => {
    const locCodes = ['WH-01', 'SH-01', 'WH-A', 'WH-B'];
    const skus = ['PVC-001'];
    await prisma.stockMovement.deleteMany({
      where: {
        OR: [
          { variant: { sku: { in: skus } } },
          { location: { code: { in: locCodes } } }
        ]
      }
    });
    await prisma.stockTransfer.deleteMany({
      where: {
        OR: [
          { source: { code: { in: locCodes } } },
          { destination: { code: { in: locCodes } } },
          { reference: 'TR-100' }
        ]
      }
    });
    await prisma.inventoryBalance.deleteMany({
      where: {
        OR: [
          { variant: { sku: { in: skus } } },
          { location: { code: { in: locCodes } } }
        ]
      }
    });
    await prisma.inventoryLocation.deleteMany({ where: { code: { in: locCodes } } });
    await prisma.productVariant.deleteMany({ where: { sku: { in: skus } } });
    await prisma.product.deleteMany({ where: { name: 'PVC Pipe' } });
    await prisma.category.deleteMany({ where: { name: 'Pipes' } });
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('can create inventory location and enforce unique code', async () => {
    const loc1 = await prisma.inventoryLocation.create({
      data: { code: 'WH-01', name: 'Main Warehouse' }
    });
    expect(loc1.id).toBeDefined();

    await expect(prisma.inventoryLocation.create({
      data: { code: 'WH-01', name: 'Duplicate Code' }
    })).rejects.toThrow(/Unique constraint failed.*code/);
  });

  it('enforces unique balance per variant per location', async () => {
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
    })).rejects.toThrow(/Foreign key constraint (failed|violated)/);
  });

  it('can support transfers between locations', async () => {
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
