import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Auth Config
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_COOKIE_NAME: z.string().default('vbg_session'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
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
  SESSION_TTL_DAYS: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  AUTH_COOKIE_NAME: process.env.AUTH_COOKIE_NAME || 'vbg_session',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
  LOGIN_RATE_LIMIT: parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10),
  LOGIN_RATE_WINDOW_SECONDS: parseInt(process.env.LOGIN_RATE_WINDOW_SECONDS || '300', 10),
} as z.infer<typeof envSchema>;
