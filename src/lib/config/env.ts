import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const skipValidation = !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

const _env = envSchema.safeParse(process.env);

if (!_env.success && !skipValidation) {
  console.error('❌ Invalid environment variables:\n', _env.error.format());
  throw new Error('Invalid environment variables');
}

export const env = _env.success ? _env.data : {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as z.infer<typeof envSchema>;
