import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';

describe('Database Integration', () => {
  beforeAll(async () => {
    // Basic connectivity check before tests run
    await prisma.$queryRaw`SELECT 1`;
  });

  it('can connect to the database and query the users table', async () => {
    const userCount = await prisma.user.count();
    expect(typeof userCount).toBe('number');
  });

  it('handles basic schema constraints', async () => {
    // Attempting to create a user with missing required fields
    // This is tested via TypeScript usually, but here we can test Prisma client behavior
    try {
      await (prisma.user.create as any)({ data: {} });
      expect.fail('Should have thrown an error');
    } catch (e: any) {
      expect(e.message).toContain('Argument email for data.email is missing');
    }
  });
});
