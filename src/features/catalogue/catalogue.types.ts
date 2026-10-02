import { Category, Brand, Product, ProductVariant } from '@prisma/client';

// Omit confidential and internal fields from safe response types
export type SafeCategory = Omit<Category, 'createdAt' | 'updatedAt'>;
export type SafeBrand = Omit<Brand, 'createdAt' | 'updatedAt'>;

// Safe variant explicitly EXCLUDES costPrice
export type SafeProductVariant = Omit<ProductVariant, 'costPrice' | 'createdAt' | 'updatedAt' | 'sellingPrice'> & {
  sellingPrice: number; // Convert Decimal to number for API serialization
};

// Safe product includes its safe variants and relationships
export type SafeProduct = Omit<Product, 'createdAt' | 'updatedAt'> & {
  category?: SafeCategory;
  brand?: SafeBrand | null;
  variants?: SafeProductVariant[];
};
