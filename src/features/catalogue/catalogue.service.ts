/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { prisma } from '@/lib/db/client';
import { AppError } from '@/lib/errors';
import { z } from 'zod';
import { 
  categorySchema, updateCategorySchema, brandSchema, updateBrandSchema, paginationSchema,
  productSchema, updateProductSchema, productVariantSchema, updateProductVariantSchema,
  productFilterSchema, categoryFilterSchema 
} from './catalogue.validation';
import { Prisma } from '@prisma/client';

export class CatalogueService {
  // --- Categories ---
  static async createCategory(data: z.infer<typeof categorySchema>) {
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new AppError('Parent category not found', 404, 'NOT_FOUND');
      if (!parent.isActive) throw new AppError('Cannot assign to an inactive parent category', 400, 'INVALID_RELATION');
    }

    try {
      return await prisma.category.create({ data });
    } catch (e: any) {
      if (e.code === 'P2002') throw new AppError('A sibling category with this name already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async getCategory(id: string) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');
    return category;
  }

  static async listCategories(params: z.infer<typeof categoryFilterSchema>) {
    const { page, limit, search, parentId, isActive } = params;
    const where: Prisma.CategoryWhereInput = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (parentId !== undefined) where.parentId = parentId;
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.category.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async updateCategory(id: string, data: z.infer<typeof updateCategorySchema>) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new AppError('Category not found', 404, 'NOT_FOUND');

    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      if (data.parentId === id) throw new AppError('A category cannot be its own parent', 400, 'INVALID_RELATION');
      if (data.parentId !== null) {
        const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parent) throw new AppError('Parent category not found', 404, 'NOT_FOUND');
        if (!parent.isActive) throw new AppError('Cannot assign to an inactive parent category', 400, 'INVALID_RELATION');
        
        let currentParentId = parent.parentId;
        let depth = 0;
        while (currentParentId && depth < 20) {
          if (currentParentId === id) throw new AppError('Cannot set a descendant category as a parent', 400, 'INVALID_RELATION');
          const ancestor = await prisma.category.findUnique({ where: { id: currentParentId }, select: { parentId: true } });
          currentParentId = ancestor?.parentId || null;
          depth++;
        }
        if (depth >= 20) throw new AppError('Category hierarchy is too deep', 400, 'INVALID_RELATION');
      }
    }

    try {
      return await prisma.category.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2002') throw new AppError('A sibling category with this name already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async archiveCategory(id: string) {
    const hasActiveChildren = await prisma.category.findFirst({ where: { parentId: id, isActive: true } });
    if (hasActiveChildren) throw new AppError('Cannot archive category with active child categories', 400, 'INVALID_RELATION');

    const hasActiveProducts = await prisma.product.findFirst({ where: { categoryId: id, isActive: true } });
    if (hasActiveProducts) throw new AppError('Cannot archive category with active products', 400, 'INVALID_RELATION');

    return prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  // --- Brands ---
  static async createBrand(data: z.infer<typeof brandSchema>) {
    try {
      return await prisma.brand.create({ data });
    } catch (e: any) {
      if (e.code === 'P2002') throw new AppError('Brand with this name already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async getBrand(id: string) {
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new AppError('Brand not found', 404, 'NOT_FOUND');
    return brand;
  }

  static async listBrands(params: z.infer<typeof paginationSchema> & { search?: string, isActive?: boolean }) {
    const { page, limit, search, isActive } = params;
    const where: Prisma.BrandWhereInput = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await Promise.all([
      prisma.brand.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' },
      }),
      prisma.brand.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async updateBrand(id: string, data: z.infer<typeof updateBrandSchema>) {
    try {
      return await prisma.brand.update({ where: { id }, data });
    } catch (e: any) {
      if (e.code === 'P2025') throw new AppError('Brand not found', 404, 'NOT_FOUND');
      if (e.code === 'P2002') throw new AppError('Brand with this name already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async archiveBrand(id: string) {
    return prisma.brand.update({ where: { id }, data: { isActive: false } });
  }

  // --- Products ---
  static async createProduct(data: z.infer<typeof productSchema>) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category || !category.isActive) throw new AppError('Category not found or inactive', 400, 'INVALID_RELATION');

    if (data.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: data.brandId } });
      if (!brand || !brand.isActive) throw new AppError('Brand not found or inactive', 400, 'INVALID_RELATION');
    }

    const { variants, ...productData } = data;
    
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: productData });

      if (variants && variants.length > 0) {
        for (const variant of variants) {
          const { costPrice, sellingPrice, ...rest } = variant;
          try {
            await tx.productVariant.create({
              data: {
                ...rest,
                attributes: rest.attributes as Prisma.InputJsonValue,
                productId: product.id,
                sellingPrice: sellingPrice,
                costPrice: costPrice ?? null,
              }
            });
          } catch (e: any) {
            if (e.code === 'P2002') throw new AppError('Duplicate SKU or Barcode found in variants', 409, 'CONFLICT');
            throw e;
          }
        }
      }
      return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: true } });
    });
  }

  static async getProduct(id: string) {
    const product = await prisma.product.findUnique({ where: { id }, include: { variants: true, category: true, brand: true } });
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    return product;
  }

  static async listProducts(params: z.infer<typeof productFilterSchema>) {
    const { page, limit, search, categoryId, brandId, isActive } = params;
    const where: Prisma.ProductWhereInput = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        include: { category: true, brand: true, variants: true }
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async updateProduct(id: string, data: Omit<z.infer<typeof updateProductSchema>, 'variants'>) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new AppError('Product not found', 404, 'NOT_FOUND');

    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category || !category.isActive) throw new AppError('Category not found or inactive', 400, 'INVALID_RELATION');
    }

    if (data.brandId && data.brandId !== existing.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: data.brandId } });
      if (!brand || !brand.isActive) throw new AppError('Brand not found or inactive', 400, 'INVALID_RELATION');
    }

    return prisma.product.update({ where: { id }, data, include: { category: true, brand: true, variants: true } });
  }

  static async archiveProduct(id: string) {
    return prisma.$transaction([
      prisma.productVariant.updateMany({ where: { productId: id, isActive: true }, data: { isActive: false } }),
      prisma.product.update({ where: { id }, data: { isActive: false } })
    ]);
  }

  // --- Product Variants ---
  static async createVariant(productId: string, data: z.infer<typeof productVariantSchema>) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw new AppError('Product not found or inactive', 400, 'INVALID_RELATION');

    try {
      const { costPrice, sellingPrice, ...rest } = data;
      return await prisma.productVariant.create({
        data: {
          ...rest,
          attributes: rest.attributes as Prisma.InputJsonValue,
          productId,
          sellingPrice: sellingPrice,
          costPrice: costPrice ?? null,
        }
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new AppError('Variant with this SKU or barcode already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async updateVariant(id: string, data: z.infer<typeof updateProductVariantSchema>) {
    const { costPrice, sellingPrice, ...rest } = data;
    const updateData: any = { ...rest };
    if (sellingPrice !== undefined) updateData.sellingPrice = sellingPrice;
    if (costPrice !== undefined) updateData.costPrice = costPrice;
    if (rest.attributes !== undefined) updateData.attributes = rest.attributes as Prisma.InputJsonValue;

    try {
      return await prisma.productVariant.update({ where: { id }, data: updateData });
    } catch (e: any) {
      if (e.code === 'P2025') throw new AppError('Variant not found', 404, 'NOT_FOUND');
      if (e.code === 'P2002') throw new AppError('Variant with this SKU or barcode already exists', 409, 'CONFLICT');
      throw e;
    }
  }

  static async archiveVariant(id: string) {
    return prisma.productVariant.update({ where: { id }, data: { isActive: false } });
  }
}
