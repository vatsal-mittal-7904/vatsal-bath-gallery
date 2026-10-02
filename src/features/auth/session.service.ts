import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/db/client';
import { env } from '@/lib/config/env';

/**
 * Generate a cryptographically secure token
 */
export function generateSessionToken(): string {
  // 32 bytes = 256 bits of entropy
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token for safe storage (so a DB leak doesn't compromise active sessions)
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session in the database
 */
export async function createSession(userId: string, token: string) {
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  // We use a transaction to optionally update lastLoginAt
  const [session] = await prisma.$transaction([
    prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return session;
}

/**
 * Look up a session and verify it's still valid
 */
export async function validateSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (Date.now() >= session.expiresAt.getTime()) {
    // Session expired, clean it up asynchronously
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (!session.user.isActive) {
    // If the user was deactivated, the session is technically invalid
    return null;
  }

  return { session, user: session.user };
}

/**
 * Revoke a specific session
 */
export async function revokeSession(token: string) {
  const tokenHash = hashSessionToken(token);
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}
