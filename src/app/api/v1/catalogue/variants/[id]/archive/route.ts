import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { hasPermission } from '@/features/auth/permissions';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { toSafeProductVariant } from '@/features/catalogue/catalogue.utils';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('catalogue:archive');
  const canReadCost = hasPermission(user.role, 'catalogue:cost:read');
  const result = await CatalogueService.archiveVariant(params.id);
  return successResponse({ variant: toSafeProductVariant(result, { includeCost: canReadCost }) }, 'Variant archived', 200, req);
});