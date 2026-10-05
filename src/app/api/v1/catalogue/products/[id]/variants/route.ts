import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { hasPermission } from '@/features/auth/permissions';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { productVariantSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeProductVariant } from '@/features/catalogue/catalogue.utils';
import { prisma } from '@/lib/db/client';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  const user = await requirePermission('catalogue:read');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const { id } = await params;
  const variants = await prisma.productVariant.findMany({ where: { productId: id } });
  return successResponse({ items: variants.map(v => toSafeProductVariant(v, { includeCost: canReadCost })) }, 'Variants retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  const user = await requirePermission('catalogue:create');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const { id } = await params;
  const body = await req.json();
  const data = productVariantSchema.parse(body);
  const result = await CatalogueService.createVariant(id, data);
  return successResponse({ variant: toSafeProductVariant(result, { includeCost: canReadCost }) }, 'Variant created', 201, req);
});