import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { toSafeCategory } from '@/features/catalogue/catalogue.utils';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission('catalogue:archive');
  const result = await CatalogueService.archiveCategory(params.id);
  return successResponse({ category: toSafeCategory(result) }, 'Category archived', 200, req);
});