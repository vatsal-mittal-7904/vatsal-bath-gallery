import { getSessionCookie } from './cookie.utils';
import { validateSessionToken } from './session.service';
import { toSafeUser } from '../users/user.utils';
import { AppError } from '@/lib/errors';
import { SafeUser } from '../users/user.types';

/**
 * Validates the current session from the request cookie.
 * Returns the SafeUser if authenticated and active.
 * Returns null if missing, expired, revoked, or user inactive.
 * Safe to call from Server Components, Layouts, and Server Actions.
 */
export async function getAuthenticatedUser(): Promise<SafeUser | null> {
  const token = await getSessionCookie();
  if (!token) return null;

  try {
    const result = await validateSessionToken(token);
    if (!result) return null;
    
    // validateSessionToken already checks user.isActive and session expiry
    return toSafeUser(result.user);
  } catch (error) {
    // If a database/infrastructure error occurs, we should throw so it's
    // logged and handled as a 500, rather than silently denying access.
    throw error;
  }
}

/**
 * Reusable authentication guard for API Route Handlers.
 * Throws a standard 401 AppError if unauthenticated.
 */
export async function requireAuthenticatedUser(): Promise<SafeUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }
  return user;
}
