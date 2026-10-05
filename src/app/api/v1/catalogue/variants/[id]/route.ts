import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { hasPermission } from '@/features/auth/permissions';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { updateProductVariantSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeProductVariant } from '@/features/catalogue/catalogue.utils';
import { prisma } from '@/lib/db/client';
import { AppError } from '@/lib/errors';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('catalogue:read');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const variant = await prisma.productVariant.findUnique({ where: { id: params.id } });
  if (!variant) throw new AppError('Variant not found', 404, 'NOT_FOUND');
  return successResponse({ variant: toSafeProductVariant(variant, { includeCost: canReadCost }) }, 'Variant retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('catalogue:update');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const body = await req.json();
  const data = updateProductVariantSchema.parse(body);
  const result = await CatalogueService.updateVariant(params.id, data);
  return successResponse({ variant: toSafeProductVariant(result, { includeCost: canReadCost }) }, 'Variant updated', 200, req);
});