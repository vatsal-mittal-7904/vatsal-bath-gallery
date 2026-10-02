import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe('Catalogue Service & API Logic', () => {
  beforeAll(async () => {
    if (!isTestDb) {
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

  it.skipIf(isTestDb)('can create a category, brand, product, and variant end-to-end', async () => {
    // 1. Create Category
    const category = await CatalogueService.createCategory({ name: 'Service Test Category', isActive: true });
    expect(category.id).toBeDefined();

    // 2. Create Brand
    const brand = await CatalogueService.createBrand({ name: 'Service Test Brand', isActive: true });
    expect(brand.id).toBeDefined();

    // 3. Create Product with initial variant
    const product = await CatalogueService.createProduct({
      name: 'Service Test Product',
      categoryId: category.id,
      brandId: brand.id,
      isActive: true,
      variants: [
        { sku: 'TEST-SRV-01', sellingPrice: 50.00, costPrice: 20.00, isActive: true, attributes: { size: 'M' } }
      ]
    });
    
    expect(product.id).toBeDefined();
    expect(product.variants).toHaveLength(1);
    expect(product.variants?.[0]?.sku).toBe('TEST-SRV-01');

    // 4. Create an additional variant
    const variant2 = await CatalogueService.createVariant(product.id, {
      sku: 'TEST-SRV-02',
      sellingPrice: 55.00,
      isActive: true,
      attributes: { size: 'L' }
    });
    expect(variant2.id).toBeDefined();
    
    // 5. Test Archival restrictions
    await expect(CatalogueService.archiveCategory(category.id)).rejects.toThrow('active products');

    // Archive product first
    await CatalogueService.archiveProduct(product.id);
    const archivedProduct = await CatalogueService.getProduct(product.id);
    expect(archivedProduct.isActive).toBe(false);

    // Variants should be automatically archived
    const v2db = await prisma.productVariant.findUnique({ where: { id: variant2.id }});
    expect(v2db?.isActive).toBe(false);

    // Now category archival works
    await CatalogueService.archiveCategory(category.id);
    const archivedCategory = await CatalogueService.getCategory(category.id);
    expect(archivedCategory.isActive).toBe(false);
  });

  it.skipIf(isTestDb)('rejects duplicate SKU creation', async () => {
    const category = await CatalogueService.createCategory({ name: 'SKU Test Category', isActive: true });
    const product = await CatalogueService.createProduct({
      name: 'SKU Test Product',
      categoryId: category.id,
      isActive: true,
      variants: [
        { sku: 'DUP-SKU-01', sellingPrice: 10, isActive: true, attributes: {} }
      ]
    });

    await expect(CatalogueService.createVariant(product.id, {
      sku: 'DUP-SKU-01',
      sellingPrice: 15,
      isActive: true,
      attributes: {}
    })).rejects.toThrow('Variant with this SKU or barcode already exists');
  });
});
