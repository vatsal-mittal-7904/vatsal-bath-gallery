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
  attributes: z.record(z.string(), z.any()).default({}),
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

// Update schemas
export const updateCategorySchema = categorySchema.partial();
export const updateBrandSchema = brandSchema.partial();
export const updateProductVariantSchema = productVariantSchema.partial();
export const updateProductSchema = productSchema.partial();

// Pagination and filtering schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const categoryFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});
