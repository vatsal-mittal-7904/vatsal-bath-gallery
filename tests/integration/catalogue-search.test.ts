/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Catalogue Search API Logic (Phase 6.3.1)', () => {
  let catPlumbing: any;
  let catFittings: any;
  let brandHindware: any;
  let brandJaguar: any;

  beforeAll(async () => {
    // Clean up
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.category.deleteMany();

    // Create taxonomies
    catPlumbing = await CatalogueService.createCategory({ name: 'Plumbing', isActive: true });
    catFittings = await CatalogueService.createCategory({ name: 'Fittings', isActive: true });
    brandHindware = await CatalogueService.createBrand({ name: 'Hindware', isActive: true });
    brandJaguar = await CatalogueService.createBrand({ name: 'Jaguar', isActive: true });

    // Create 1. Simple exact match
    await CatalogueService.createProduct({
      name: 'Standard PVC Pipe',
      categoryId: catPlumbing.id,
      brandId: brandHindware.id,
      isActive: true,
      variants: [{ sku: 'PVC-PIPE-01', sellingPrice: 100, isActive: true, attributes: { size: '1 inch' } }]
    });

    // Create 2. Hindi / Hinglish string
    await CatalogueService.createProduct({
      name: 'Lamba नल (Long Tap)',
      categoryId: catFittings.id,
      brandId: brandJaguar.id,
      isActive: true,
      variants: [{ sku: 'TAP-HIN-01', sellingPrice: 250, isActive: true, attributes: {} }]
    });

    // Create 3. Multiple variants, Size search
    await CatalogueService.createProduct({
      name: 'Brass Elbow',
      categoryId: catFittings.id,
      brandId: null,
      isActive: true,
      variants: [
        { sku: 'ELBOW-15MM', sellingPrice: 50, isActive: true, attributes: { size: '15mm' } },
        { sku: 'ELBOW-20MM', sellingPrice: 75, isActive: true, attributes: { size: '20mm', color: 'gold' } }
      ]
    });

    // Create 4. Duplicate/Similar names for pagination
    for (let i = 1; i <= 15; i++) {
      await CatalogueService.createProduct({
        name: `Ceramic Basin Variant ${i}`,
        categoryId: catPlumbing.id,
        brandId: brandHindware.id,
        isActive: true,
        variants: [{ sku: `BASIN-${i}`, sellingPrice: 1000 + i, isActive: true, attributes: {} }]
      });
    }
  });

  afterAll(async () => {
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.category.deleteMany();
  });

  it('handles exact product-name search', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'Standard PVC Pipe' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toBe('Standard PVC Pipe');
  });

  it('handles case-insensitive partial English search', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'pvc PIP' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toBe('Standard PVC Pipe');
  });

  it('handles Hindi and Hinglish search', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'नल' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toContain('नल');

    const res2 = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'lamba' });
    expect(res2.items).toHaveLength(1);
    expect(res2.items[0]!.name).toContain('Lamba');
  });

  it('filters by brand and category', async () => {
    const res = await CatalogueService.listProducts({ 
      page: 1, limit: 10, 
      categoryId: catFittings.id,
      brandId: brandJaguar.id
    });
    // Should return Lamba नल
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toContain('Lamba नल');
  });

  it('matches variant attributes (size)', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: '15mm' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toBe('Brass Elbow');
  });

  it('matches SKU', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'ELBOW-20MM' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.name).toBe('Brass Elbow');
  });

  it('handles pagination properly for multiple similar products', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'Ceramic Basin' });
    expect(res.items).toHaveLength(10);
    expect(res.total).toBe(15);
    expect(res.totalPages).toBe(2);

    const resPage2 = await CatalogueService.listProducts({ page: 2, limit: 10, search: 'Ceramic Basin' });
    expect(resPage2.items).toHaveLength(5);
  });

  it('returns empty list for non-existent searches', async () => {
    const res = await CatalogueService.listProducts({ page: 1, limit: 10, search: 'Unobtainium' });
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
  });
});
