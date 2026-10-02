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
    } catch (error) {
      // Clear cookie as a best-effort fallback but bubble up the 500 error
      await clearSessionCookie();
      throw new AppError('Failed to revoke session on server', 500, 'INTERNAL_SERVER_ERROR');
    }
  }

  // Always clear cookie
  await clearSessionCookie();

  return successResponse(null, 'Logged out successfully', 200, req);
}

export const POST = withApiWrapper(logoutHandler);
