import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { BillService } from '@/features/billing/bill.service';
import { billUpdateSchema } from '@/features/billing/billing.validation';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('invoices:read');
  const { id } = await params;
  const bill = await BillService.getBill(id);
  return successResponse({ bill }, 'Bill retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('invoices:update');
  const { id } = await params;
  const body = await req.json();
  const data = billUpdateSchema.parse(body);
  const bill = await BillService.updateBill(id, data);
  return successResponse({ bill }, 'Bill updated', 200, req);
});
