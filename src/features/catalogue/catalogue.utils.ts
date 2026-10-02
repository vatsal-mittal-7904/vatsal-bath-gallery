/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Category, Brand, Product, ProductVariant } from '@prisma/client';
import { SafeCategory, SafeBrand, SafeProduct, SafeProductVariant } from './catalogue.types';

export function toSafeCategory(category: Category): SafeCategory {
  const { createdAt, updatedAt, ...safe } = category;
  return safe;
}

export function toSafeBrand(brand: Brand): SafeBrand {
  const { createdAt, updatedAt, ...safe } = brand;
  return safe;
}

export function toSafeProductVariant(variant: ProductVariant): SafeProductVariant {
  const { costPrice, createdAt, updatedAt, ...safe } = variant;
  return {
    ...safe,
    sellingPrice: Number(safe.sellingPrice),
  };
}

export function toSafeProduct(
  product: Product & { category?: Category; brand?: Brand | null; variants?: ProductVariant[] }
): SafeProduct {
  const { createdAt, updatedAt, ...safe } = product;
  
  return {
    ...safe,
    category: safe.category ? toSafeCategory(safe.category) : undefined,
    brand: safe.brand ? toSafeBrand(safe.brand) : undefined,
    variants: safe.variants ? safe.variants.map(toSafeProductVariant) : undefined,
  };
}
