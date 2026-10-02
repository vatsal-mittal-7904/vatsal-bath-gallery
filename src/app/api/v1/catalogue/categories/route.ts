import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { categorySchema, categoryFilterSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeCategory } from '@/features/catalogue/catalogue.utils';

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:read');
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const params = categoryFilterSchema.parse(query);
  const result = await CatalogueService.listCategories(params);
  return successResponse({ ...result, items: result.items.map(toSafeCategory) }, 'Categories retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:create');
  const body = await req.json();
  const data = categorySchema.parse(body);
  const result = await CatalogueService.createCategory(data);
  return successResponse({ category: toSafeCategory(result) }, 'Category created', 201, req);
});