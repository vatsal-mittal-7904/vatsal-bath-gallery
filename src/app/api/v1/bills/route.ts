import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { BillService } from '@/features/billing/bill.service';
import { billSchema } from '@/features/billing/billing.validation';
import { z } from 'zod';
import { BillStatus } from '@prisma/client';

import { hasPermission } from '@/features/auth/permissions';

const filterSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(BillStatus).optional()
});

export const GET = withApiWrapper(async (req: NextRequest) => {
  const user = await requirePermission('invoices:read');
  const query = Object.fromEntries(new URL(req.url).searchParams);
  const { page, limit, ...filters } = filterSchema.parse(query);
  const includeProfit = hasPermission(user.role, 'reports:profit:read');
  const result = await BillService.getBills(page, limit, filters, { includeProfit });
  return successResponse(result, 'Bills retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  const user = await requirePermission('invoices:create');
  const body = await req.json();
  
  const idempotencyKey = req.headers.get('idempotency-key') || undefined;
  const data = billSchema.parse(body);
  
  const bill = await BillService.createBill({ ...data, creatorId: user!.id, idempotencyKey });
  return successResponse({ bill }, 'Bill created', 201, req);
});
