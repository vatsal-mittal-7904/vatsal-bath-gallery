import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { EstimateService } from '@/features/billing/estimate.service';
import { BillService } from '@/features/billing/bill.service';
import { estimateConvertSchema } from '@/features/billing/billing.validation';
import { ForbiddenError, ValidationError } from '@/lib/errors';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('estimates:update');
  const user = await requirePermission('invoices:create');
  const { id } = await params;

  const existing = await EstimateService.getEstimate(id);

  if (user.role !== 'OWNER' && existing.creatorId && existing.creatorId !== user.id) {
    throw new ForbiddenError('You do not have permission to convert this estimate');
  }

  const idempotencyKey = req.headers.get('idempotency-key') || undefined;

  let body: unknown = {};
  const text = await req.text();
  if (text && text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ValidationError("Invalid JSON payload");
    }
  }

  const { version } = estimateConvertSchema.parse(body);

  const bill = await BillService.convertEstimateToBill(id, version, user!.id, idempotencyKey);
  return successResponse({ bill }, 'Estimate converted to bill', 201, req);
});

