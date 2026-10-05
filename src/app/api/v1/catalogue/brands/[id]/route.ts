import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { updateBrandSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeBrand } from '@/features/catalogue/catalogue.utils';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:read');
  const { id } = await params;
  const result = await CatalogueService.getBrand(id);
  return successResponse({ brand: toSafeBrand(result) }, 'Brand retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:update');
  const { id } = await params;
  const body = await req.json();
  const data = updateBrandSchema.parse(body);
  const result = await CatalogueService.updateBrand(id, data);
  return successResponse({ brand: toSafeBrand(result) }, 'Brand updated', 200, req);
});