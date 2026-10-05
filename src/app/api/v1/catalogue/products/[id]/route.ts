import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { hasPermission } from '@/features/auth/permissions';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { updateProductSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeProduct } from '@/features/catalogue/catalogue.utils';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('catalogue:read');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const result = await CatalogueService.getProduct(params.id);
  return successResponse({ product: toSafeProduct(result, { includeCost: canReadCost }) }, 'Product retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('catalogue:update');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const body = await req.json();
  // variants are not updated through this endpoint, they use their own endpoint
  const { variants: _variants, ...productUpdate } = updateProductSchema.parse(body);
  const result = await CatalogueService.updateProduct(params.id, productUpdate);
  return successResponse({ product: toSafeProduct(result, { includeCost: canReadCost }) }, 'Product updated', 200, req);
});