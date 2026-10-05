import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { EstimateService } from '@/features/billing/estimate.service';
import { estimateStatusUpdateSchema } from '@/features/billing/billing.validation';
import { ForbiddenError } from '@/lib/errors';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  const user = await requirePermission('estimates:update');
  const { id } = await params;
  const existing = await EstimateService.getEstimate(id);

  if (user.role !== 'OWNER' && existing.creatorId && existing.creatorId !== user.id) {
    throw new ForbiddenError('You do not have permission to update this estimate');
  }

  const body = await req.json();
  const { status, version } = estimateStatusUpdateSchema.parse(body);
  const estimate = await EstimateService.updateStatus(id, status, version);
  return successResponse({ estimate }, 'Estimate status updated', 200, req);
});
