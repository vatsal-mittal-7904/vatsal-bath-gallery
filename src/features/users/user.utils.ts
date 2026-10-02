import { User } from '@prisma/client';
import { SafeUser } from './user.types';

/**
 * Strips sensitive fields like passwordHash from a User record
 * before returning it to the frontend or logging it.
 */
export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
