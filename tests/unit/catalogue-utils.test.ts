/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { toSafeProduct, toSafeProductVariant } from '../../src/features/catalogue/catalogue.utils';
import { hasPermission } from '../../src/features/auth/permissions';
import { Role } from '@prisma/client';

describe('Catalogue Utils (Data Exposure & Cost Price Authorization)', () => {
  const sampleRawVariant: any = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-1',
    sellingPrice: 100,
    costPrice: 50,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleRawProduct: any = {
    id: 'prod-1',
    name: 'Test Product',
    categoryId: 'cat-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [sampleRawVariant]
  };

  it('1. OWNER with catalogue:cost:read → costPrice present', () => {
    const canReadCost = hasPermission(Role.OWNER, 'catalogue:cost:read');
    expect(canReadCost).toBe(true);

    const safeProduct = toSafeProduct(sampleRawProduct, { includeCost: canReadCost });
    expect(safeProduct.variants?.[0]?.costPrice).toBe(50);

    const safeVariant = toSafeProductVariant(sampleRawVariant, { includeCost: canReadCost });
    expect(safeVariant.costPrice).toBe(50);
  });

  it('2. STAFF → costPrice absent', () => {
    const canReadCost = hasPermission(Role.STAFF, 'catalogue:cost:read');
    expect(canReadCost).toBe(false);

    const safeProduct = toSafeProduct(sampleRawProduct, { includeCost: canReadCost });
    expect('costPrice' in (safeProduct.variants?.[0] || {})).toBe(false);
    expect(safeProduct.variants?.[0]?.costPrice).toBeUndefined();

    const safeVariant = toSafeProductVariant(sampleRawVariant, { includeCost: canReadCost });
    expect('costPrice' in safeVariant).toBe(false);
    expect(safeVariant.costPrice).toBeUndefined();
  });

  it('3. User without the permission → costPrice absent', () => {
    const canReadCost = hasPermission(null as any, 'catalogue:cost:read');
    expect(canReadCost).toBe(false);

    const safeProduct = toSafeProduct(sampleRawProduct, { includeCost: false });
    expect('costPrice' in (safeProduct.variants?.[0] || {})).toBe(false);
    expect(safeProduct.variants?.[0]?.costPrice).toBeUndefined();

    const safeVariant = toSafeProductVariant(sampleRawVariant, { includeCost: false });
    expect('costPrice' in safeVariant).toBe(false);
    expect(safeVariant.costPrice).toBeUndefined();
  });

  it('4. Existing catalogue behavior remains unchanged (default strips costPrice and timestamps)', () => {
    // Calling without options (backwards compatible default)
    const safeProduct = toSafeProduct(sampleRawProduct);
    expect((safeProduct as any).createdAt).toBeUndefined();
    expect((safeProduct as any).updatedAt).toBeUndefined();
    expect(safeProduct.variants?.[0]?.costPrice).toBeUndefined();
    expect((safeProduct.variants?.[0] as any).createdAt).toBeUndefined();
    expect(safeProduct.variants?.[0]?.sellingPrice).toBe(100);

    const safeVariant = toSafeProductVariant(sampleRawVariant);
    expect(safeVariant.costPrice).toBeUndefined();
    expect(safeVariant.sellingPrice).toBe(100);
  });
});
