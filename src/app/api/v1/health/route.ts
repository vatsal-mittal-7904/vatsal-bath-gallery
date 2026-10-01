import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';

async function healthHandler(req: NextRequest) {
  // Database readiness will be added in Subphase 1.4
  return successResponse({ status: 'ok' }, 'Service is healthy', 200, req);
}

export const GET = withApiWrapper(healthHandler);
