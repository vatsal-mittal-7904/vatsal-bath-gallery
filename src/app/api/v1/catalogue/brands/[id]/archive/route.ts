import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { toSafeBrand } from '@/features/catalogue/catalogue.utils';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:archive');
  const { id } = await params;
  const result = await CatalogueService.archiveBrand(id);
  return successResponse({ brand: toSafeBrand(result) }, 'Brand archived', 200, req);
});