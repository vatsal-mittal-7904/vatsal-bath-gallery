import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { EstimateService } from '@/features/billing/estimate.service';
import { estimateSchema } from '@/features/billing/billing.validation';
import { z } from 'zod';
import { EstimateStatus } from '@prisma/client';

const filterSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(EstimateStatus).optional()
});

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('estimates:read');
  const query = Object.fromEntries(new URL(req.url).searchParams);
  const { page, limit, ...filters } = filterSchema.parse(query);
  const result = await EstimateService.getEstimates(page, limit, filters);
  return successResponse(result, 'Estimates retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  const user = await requirePermission('estimates:create');
  const body = await req.json();
  
  const idempotencyKey = req.headers.get('idempotency-key') || undefined;
  const data = estimateSchema.parse(body);
  
  const estimate = await EstimateService.createEstimate({ ...data, creatorId: user!.id, idempotencyKey });
  return successResponse({ estimate }, 'Estimate created', 201, req);
});
