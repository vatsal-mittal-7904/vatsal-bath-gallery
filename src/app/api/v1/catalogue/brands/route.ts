import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { brandSchema, paginationSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeBrand } from '@/features/catalogue/catalogue.utils';
import { z } from 'zod';

const brandFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:read');
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const params = brandFilterSchema.parse(query);
  const result = await CatalogueService.listBrands(params);
  return successResponse({ ...result, items: result.items.map(toSafeBrand) }, 'Brands retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:create');
  const body = await req.json();
  const data = brandSchema.parse(body);
  const result = await CatalogueService.createBrand(data);
  return successResponse({ brand: toSafeBrand(result) }, 'Brand created', 201, req);
});