import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CustomerService } from '@/features/billing/customer.service';
import { customerUpdateSchema } from '@/features/billing/billing.validation';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('customers:read');
  const { id } = await params;
  const customer = await CustomerService.getCustomer(id);
  return successResponse({ customer }, 'Customer retrieved', 200, req);
});

export const PATCH = withApiWrapper(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('customers:update');
  const { id } = await params;
  const body = await req.json();
  const data = customerUpdateSchema.parse(body);
  const customer = await CustomerService.updateCustomer(id, data);
  return successResponse({ customer }, 'Customer updated', 200, req);
});
