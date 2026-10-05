import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { Role } from '@prisma/client';
import { hashPassword } from '../../src/features/auth/password.utils';
import { generateSessionToken, createSession, validateSessionToken, revokeSession, hashSessionToken } from '../../src/features/auth/session.service';


describe('Auth & Session Integration', () => {
  const testEmail = 'auth-test@example.com';
  let userId = '';

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: await hashPassword('password123'),
        role: Role.STAFF,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  it('creates, validates, and revokes a session securely', async () => {
    const rawToken = generateSessionToken();
    
    // 1. Create
    const session = await createSession(userId, rawToken);
    expect(session.id).toBeDefined();
    
    // Verify DB does NOT store raw token
    const dbSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(dbSession?.tokenHash).toBe(hashSessionToken(rawToken));
    expect(dbSession?.tokenHash).not.toBe(rawToken);

    // 2. Validate valid token
    const validated = await validateSessionToken(rawToken);
    expect(validated).not.toBeNull();
    expect(validated?.user.id).toBe(userId);

    // 3. Validate invalid token
    const invalid = await validateSessionToken('wrong-token');
    expect(invalid).toBeNull();

    // 4. Revoke
    await revokeSession(rawToken);
    const postRevoke = await validateSessionToken(rawToken);
    expect(postRevoke).toBeNull();
  });
});
