import { env } from '@/lib/config/env';
import { AppError } from '@/lib/errors';

// A simple in-memory rate limiter for login attempts (IP based).
// NOTE: This is for single-instance or local dev. 
// For distributed production, replace with Redis or a DB table.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(ip: string) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  // Clean up expired record
  if (record && now > record.resetAt) {
    loginAttempts.delete(ip);
  }

  const currentRecord = loginAttempts.get(ip);

  if (currentRecord) {
    if (currentRecord.count >= env.LOGIN_RATE_LIMIT) {
      throw new AppError('Too many login attempts. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }
    currentRecord.count += 1;
  } else {
    loginAttempts.set(ip, {
      count: 1,
      resetAt: now + env.LOGIN_RATE_WINDOW_SECONDS * 1000,
    });
  }
}
