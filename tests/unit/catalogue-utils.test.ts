import { describe, it, expect } from 'vitest';
import { toSafeProductVariant } from '../../src/features/catalogue/catalogue.utils';
import { Decimal } from '@prisma/client/runtime/library';
import { ProductVariant } from '@prisma/client';

describe('Catalogue Utils', () => {
  it('strips costPrice and dates from variants and converts Decimal to number', () => {
    const variant: ProductVariant = {
      id: 'var-1',
      productId: 'prod-1',
      sku: 'TEST-SKU',
      barcode: null,
      attributes: { size: 'Large' },
      sellingPrice: new Decimal('99.99'),
      costPrice: new Decimal('50.00'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const safe = toSafeProductVariant(variant);

    expect(safe).not.toHaveProperty('costPrice');
    expect(safe).not.toHaveProperty('createdAt');
    expect(safe).not.toHaveProperty('updatedAt');
    expect(safe.sellingPrice).toBe(99.99); // Type conversion assertion
    expect(typeof safe.sellingPrice).toBe('number');
  });
});
