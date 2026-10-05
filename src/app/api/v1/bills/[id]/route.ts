import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { BillService } from '@/features/billing/bill.service';
import { billUpdateSchema } from '@/features/billing/billing.validation';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission('invoices:read');
  const bill = await BillService.getBill(params.id);
  return successResponse({ bill }, 'Bill retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission('invoices:update');
  const body = await req.json();
  const data = billUpdateSchema.parse(body);
  const bill = await BillService.updateBill(params.id, data);
  return successResponse({ bill }, 'Bill updated', 200, req);
});
