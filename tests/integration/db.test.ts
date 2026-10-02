/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe('Database Integration', () => {
  beforeAll(async () => {
    if (!isTestDb) {
      await prisma.$queryRaw`SELECT 1`;
    }
  });

  it.skipIf(isTestDb)('can connect to the database and query the users table', async () => {
    const userCount = await prisma.user.count();
    expect(typeof userCount).toBe('number');
  });

  it.skipIf(isTestDb)('handles basic schema constraints', async () => {
    try {
      await (prisma.user.create as any)({ data: {} });
      expect.fail('Should have thrown an error');
    } catch (e: any) {
      expect(e.message).toContain('Argument email for data.email is missing');
    }
  });
});
