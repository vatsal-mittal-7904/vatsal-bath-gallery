import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(255),
  parentId: z.string().uuid('Invalid parent ID').optional().nullable(),
  isActive: z.boolean().default(true),
});

export const brandSchema = z.object({
  name: z.string().min(1, 'Brand name is required').max(255),
  isActive: z.boolean().default(true),
});

export const productVariantSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(100),
  barcode: z.string().max(100).optional().nullable(),
  attributes: z.record(z.string()).default({}),
  sellingPrice: z.number().min(0, 'Selling price cannot be negative'),
  costPrice: z.number().min(0, 'Cost price cannot be negative').optional().nullable(),
  isActive: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  categoryId: z.string().uuid('Invalid category ID'),
  brandId: z.string().uuid('Invalid brand ID').optional().nullable(),
  isActive: z.boolean().default(true),
  variants: z.array(productVariantSchema).optional(),
});
