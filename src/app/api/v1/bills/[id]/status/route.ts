import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { BillService } from '@/features/billing/bill.service';
import { billStatusUpdateSchema } from '@/features/billing/billing.validation';
import { BillStatus } from '@prisma/client';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const body = await req.json();
  const { status, locationId, reason } = billStatusUpdateSchema.parse(body);

  let user;
  if (status === BillStatus.CANCELLED) {
    user = await requirePermission('invoices:cancel');
  } else {
    user = await requirePermission('invoices:update');
  }

  const idempotencyKey = req.headers.get('idempotency-key') || undefined;

  const bill = await BillService.updateStatus(params.id, status, {
    userId: user?.id,
    locationId,
    idempotencyKey,
    reason
  });
  return successResponse({ bill }, 'Bill status updated', 200, req);
});
