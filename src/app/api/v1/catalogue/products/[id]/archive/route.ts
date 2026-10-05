import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('catalogue:archive');
  const { id } = await params;
  await CatalogueService.archiveProduct(id);
  return successResponse({}, 'Product archived', 200, req);
});