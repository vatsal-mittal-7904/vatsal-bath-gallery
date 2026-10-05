import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { EstimateService } from '@/features/billing/estimate.service';
import { estimateUpdateSchema } from '@/features/billing/billing.validation';
import { ForbiddenError } from '@/lib/errors';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  const user = await requirePermission('estimates:read');
  const { id } = await params;
  const estimate = await EstimateService.getEstimate(id);

  if (user.role !== 'OWNER' && estimate.creatorId && estimate.creatorId !== user.id) {
    throw new ForbiddenError('You do not have permission to access this estimate');
  }

  return successResponse({ estimate }, 'Estimate retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  const user = await requirePermission('estimates:update');
  const { id } = await params;
  const existing = await EstimateService.getEstimate(id);

  if (user.role !== 'OWNER' && existing.creatorId && existing.creatorId !== user.id) {
    throw new ForbiddenError('You do not have permission to update this estimate');
  }

  const body = await req.json();
  const data = estimateUpdateSchema.parse(body);
  const estimate = await EstimateService.updateEstimate(id, data);
  return successResponse({ estimate }, 'Estimate updated', 200, req);
});
