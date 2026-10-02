import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requireAuthenticatedUser } from '@/features/auth/auth.guard';

async function meHandler(req: NextRequest) {
  // Guard throws 401 if unauthorized
  const user = await requireAuthenticatedUser();
  return successResponse({ user }, 'Authenticated', 200, req);
}

export const GET = withApiWrapper(meHandler);
