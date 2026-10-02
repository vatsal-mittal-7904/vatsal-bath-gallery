import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { revokeSession } from '@/features/auth/session.service';
import { getSessionCookie, clearSessionCookie } from '@/features/auth/cookie.utils';
import { AppError } from '@/lib/errors';
import { env } from '@/lib/config/env';

async function logoutHandler(req: NextRequest) {
  // Basic Origin/CSRF check
  const origin = req.headers.get('origin');
  if (origin && !origin.startsWith(env.APP_BASE_URL)) {
    throw new AppError('Invalid origin', 403, 'FORBIDDEN');
  }

  const token = await getSessionCookie();
  
  if (token) {
    try {
      await revokeSession(token);
    } catch (e) {
      // Even if revocation fails (e.g. DB error), we still want to clear the cookie.
      console.error('Failed to revoke session in database during logout:', e);
    }
  }

  // Always clear cookie
  await clearSessionCookie();

  return successResponse(null, 'Logged out successfully', 200, req);
}

export const POST = withApiWrapper(logoutHandler);
