/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

describe('Database Integration', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  it('can connect to the database and query the users table', async () => {
    const userCount = await prisma.user.count();
    expect(typeof userCount).toBe('number');
  });

  it('handles basic schema constraints', async () => {
    try {
      await (prisma.user.create as any)({ data: {} });
      expect.fail('Should have thrown an error');
    } catch (e: any) {
      expect(e.message).toMatch(/Argument [`"]?email[`"]?.*is missing/);
    }
  });
});
