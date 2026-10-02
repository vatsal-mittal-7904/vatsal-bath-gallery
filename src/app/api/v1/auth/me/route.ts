import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { validateSessionToken } from '@/features/auth/session.service';
import { getSessionCookie } from '@/features/auth/cookie.utils';
import { toSafeUser } from '@/features/users/user.utils';
import { AppError } from '@/lib/errors';

async function meHandler(req: NextRequest) {
  const token = await getSessionCookie();
  
  if (!token) {
    throw new AppError('Not authenticated', 401, 'UNAUTHORIZED');
  }

  const result = await validateSessionToken(token);

  if (!result) {
    throw new AppError('Session invalid or expired', 401, 'UNAUTHORIZED');
  }

  return successResponse({ user: toSafeUser(result.user) }, 'Authenticated', 200, req);
}

export const GET = withApiWrapper(meHandler);
