import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CustomerService } from '@/features/billing/customer.service';

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission('customers:delete');
  const customer = await CustomerService.archiveCustomer(params.id);
  return successResponse({ customer }, 'Customer archived', 200, req);
});
