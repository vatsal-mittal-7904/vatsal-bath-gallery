import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { toSafeUser } from '../../src/features/users/user.utils';
import { Role } from '@prisma/client';

describe('User Model Integration', () => {
  const testEmail = 'test-user-model@example.com';

  const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

  // Clean up before and after tests (only if not mocked testdb)
  beforeAll(async () => {
    if (!isTestDb) {
      await prisma.user.deleteMany({ where: { email: testEmail } });
    }
  });

  afterAll(async () => {
    if (!isTestDb) {
      await prisma.user.deleteMany({ where: { email: testEmail } });
    }
  });

  it.skipIf(isTestDb)('creates a user with default STAFF role and active status', async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Test User',
        passwordHash: 'dummy-hash', // Safe representation only, not a real hash
      },
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe(testEmail);
    expect(user.role).toBe(Role.STAFF);
    expect(user.isActive).toBe(true);
    expect(user.passwordHash).toBe('dummy-hash');
  });

  it.skipIf(isTestDb)('rejects duplicate email addresses', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: 'another-hash',
        },
      })
    ).rejects.toThrow(/Unique constraint failed/);
  });

  it('toSafeUser strips passwordHash', () => {
    const rawUser = {
      id: '123',
      email: 'safe@example.com',
      name: 'Safe',
      passwordHash: 'secret123',
      role: Role.OWNER,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const safeUser = toSafeUser(rawUser);

    expect(safeUser).not.toHaveProperty('passwordHash');
    expect(safeUser.email).toBe('safe@example.com');
  });
});
