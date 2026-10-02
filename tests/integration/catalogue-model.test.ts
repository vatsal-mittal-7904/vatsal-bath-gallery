import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe('Catalogue Models & Constraints', () => {
  beforeAll(async () => {
    if (!isTestDb) {
      // Clear data for isolation
      await prisma.productVariant.deleteMany();
      await prisma.product.deleteMany();
      await prisma.brand.deleteMany();
      await prisma.category.deleteMany();
    }
  });

  afterAll(async () => {
    if (!isTestDb) {
      await prisma.productVariant.deleteMany();
      await prisma.product.deleteMany();
      await prisma.brand.deleteMany();
      await prisma.category.deleteMany();
    }
  });

  it.skipIf(isTestDb)('prevents duplicate category names at the same hierarchy level', async () => {
    const parent = await prisma.category.create({
      data: { name: 'Sanitaryware' },
    });

    await prisma.category.create({
      data: { name: 'Wash Basins', parentId: parent.id },
    });

    // Attempting to create sibling with same name should fail
    await expect(
      prisma.category.create({
        data: { name: 'Wash Basins', parentId: parent.id },
      })
    ).rejects.toThrow();
  });

  it.skipIf(isTestDb)('prevents duplicate SKUs across variants', async () => {
    const category = await prisma.category.create({
      data: { name: 'Taps' },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Brass Tap',
        categoryId: category.id,
      },
    });

    await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'TAP-BRASS-01',
        sellingPrice: 15.99,
      },
    });

    // Attempting to reuse SKU
    await expect(
      prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: 'TAP-BRASS-01',
          sellingPrice: 19.99,
        },
      })
    ).rejects.toThrow();
  });

  it.skipIf(isTestDb)('allows optional brands and preserves referential integrity', async () => {
    const brand = await prisma.brand.create({
      data: { name: 'PremiumBrand' },
    });

    const category = await prisma.category.create({
      data: { name: 'Pipes' },
    });

    // Product with brand
    const p1 = await prisma.product.create({
      data: {
        name: 'PVC Pipe',
        categoryId: category.id,
        brandId: brand.id,
      },
    });

    // Product without brand
    const p2 = await prisma.product.create({
      data: {
        name: 'Unbranded Pipe',
        categoryId: category.id,
      },
    });

    expect(p1.brandId).toBe(brand.id);
    expect(p2.brandId).toBeNull();

    // Referential integrity: cannot delete category if products depend on it (Restrict)
    await expect(
      prisma.category.delete({ where: { id: category.id } })
    ).rejects.toThrow();
  });
});
