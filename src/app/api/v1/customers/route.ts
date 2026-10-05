import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CustomerService } from '@/features/billing/customer.service';
import { customerSchema } from '@/features/billing/billing.validation';
import { z } from 'zod';

const filterSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional()
});

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('customers:read');
  const query = Object.fromEntries(new URL(req.url).searchParams);
  const { page, limit, ...filters } = filterSchema.parse(query);
  const result = await CustomerService.getCustomers(page, limit, filters);
  return successResponse(result, 'Customers retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('customers:create');
  const body = await req.json();
  const data = customerSchema.parse(body);
  const customer = await CustomerService.createCustomer(data);
  return successResponse({ customer }, 'Customer created', 201, req);
});
