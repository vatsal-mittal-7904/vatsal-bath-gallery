import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../src/lib/db/client';

describe('Database Integration', () => {
  it('Prisma client initializes correctly', () => {
    expect(prisma).toBeDefined();
  });

  // We only run this if DATABASE_URL is set to a real database during tests
  it.skipIf(!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('testdb'))('connects to the database successfully', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].result).toBe(1);
  });
});
