import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

describe('Environment Configuration', () => {
  it('parses valid configuration', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('fails on missing required DATABASE_URL', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails on invalid port', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      PORT: 'invalid'
    });
    expect(result.success).toBe(false);
  });

  it('fails on invalid environment mode', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/db',
      NODE_ENV: 'staging'
    });
    expect(result.success).toBe(false);
  });
});
