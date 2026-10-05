import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { PaymentService } from '@/features/billing/payment.service';
import { paymentSchema } from '@/features/billing/billing.validation';
import { z } from 'zod';

export const GET = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission('payments:read');
  const payments = await PaymentService.getPaymentsByBill(params.id);
  return successResponse({ payments }, 'Payments retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requirePermission('payments:record');
  const body = await req.json();
  
  const idempotencyKey = req.headers.get('idempotency-key') || undefined;
  
  // Exclude billId from body and just override it from params to ensure they match
  const data = paymentSchema.parse({ ...body, billId: params.id });
  
  const payment = await PaymentService.recordPayment(params.id, { 
    ...data, 
    recordedById: user!.id,
    idempotencyKey 
  });
  
  return successResponse({ payment }, 'Payment recorded', 201, req);
});
