import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { updateCategorySchema } from '@/features/catalogue/catalogue.validation';
import { toSafeCategory } from '@/features/catalogue/catalogue.utils';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:read');
  const { id } = await params;
  const result = await CatalogueService.getCategory(id);
  return successResponse({ category: toSafeCategory(result) }, 'Category retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:update');
  const { id } = await params;
  const body = await req.json();
  const data = updateCategorySchema.parse(body);
  const result = await CatalogueService.updateCategory(id, data);
  return successResponse({ category: toSafeCategory(result) }, 'Category updated', 200, req);
});