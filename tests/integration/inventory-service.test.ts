/* eslint-disable */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { MovementType } from '@prisma/client';


const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe('Inventory Service', () => {
  let locationId = '';
  let variantId = '';
  
  beforeAll(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    const loc = await prisma.inventoryLocation.create({ data: { code: 'SRV-LOC', name: 'Service Location' } });
    locationId = loc.id;
    
    const cat = await prisma.category.create({ data: { name: 'Service Category' } });
    const prod = await prisma.product.create({ data: { name: 'Service Prod', categoryId: cat.id } });
    const variant = await prisma.productVariant.create({ data: { productId: prod.id, sku: 'SRV-SKU', sellingPrice: 10 } });
    variantId = variant.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  });

  it('prevents opening stock duplicate conflicts', async () => {
    await InventoryService.recordOpeningStock({
      variantId, locationId, quantity: 100, reason: 'Init'
    });
    
    // Duplicate initialization should fail
    await expect(InventoryService.recordOpeningStock({
      variantId, locationId, quantity: 50, reason: 'Double init'
    })).rejects.toThrow(/Balance already initialized/);
  });

  it('issues stock atomically and prevents negative stock', async () => {
    // Current stock is 100
    await InventoryService.issueStock({
      variantId, locationId, quantity: 40, reference: 'INV-1'
    });
    
    let balance = await InventoryService.getBalance(variantId, locationId);
    expect(balance!.quantity.toNumber()).toBe(60);

    // Over-issuing should fail
    await expect(InventoryService.issueStock({
      variantId, locationId, quantity: 70, reference: 'INV-2'
    })).rejects.toThrow(/Insufficient stock/);
  });

  it('preserves exact decimal fractions', async () => {
    await InventoryService.receiveStock({
      variantId, locationId, quantity: 2.345, reference: 'PO-1'
    });
    let balance = await InventoryService.getBalance(variantId, locationId);
    // 60 + 2.345 = 62.345
    expect(balance!.quantity.toNumber()).toBe(62.345);
  });

  it('handles idempotency gracefully', async () => {
    await InventoryService.adjustStock({
      variantId, locationId, type: MovementType.POSITIVE_ADJUSTMENT, quantity: 5, reason: 'Found stock', idempotencyKey: 'idem-1'
    });

    // Duplicate submission should fail early
    await expect(InventoryService.adjustStock({
      variantId, locationId, type: MovementType.POSITIVE_ADJUSTMENT, quantity: 5, reason: 'Found stock', idempotencyKey: 'idem-1'
    })).rejects.toThrow(/already been processed/);
  });

});
