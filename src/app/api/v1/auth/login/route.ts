import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { loginSchema } from '@/features/auth/auth.validation';
import { checkLoginRateLimit } from '@/features/auth/rate-limit';
import { prisma } from '@/lib/db/client';
import { verifyPassword, verifyDummyPassword } from '@/features/auth/password.utils';
import { generateSessionToken, createSession } from '@/features/auth/session.service';
import { setSessionCookie } from '@/features/auth/cookie.utils';
import { toSafeUser } from '@/features/users/user.utils';
import { AppError } from '@/lib/errors';
import { env } from '@/lib/config/env';

async function loginHandler(req: NextRequest) {
  // Basic Origin/CSRF check
  const origin = req.headers.get('origin');
  if (origin && !origin.startsWith(env.APP_BASE_URL)) {
    throw new AppError('Invalid origin', 403, 'FORBIDDEN');
  }

  // Rate Limiting by IP (fallback to a default string if undefined)
  // In Next.js App Router, req.ip is often available depending on deployment
  const ip = (req as any).ip || req.headers.get('x-forwarded-for') || 'unknown';
  checkLoginRateLimit(ip);

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED'); // Generic error for invalid input at login
  }

  const { email, password } = parsed.data;

  // Lookup user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Verify password or perform dummy hash to prevent timing attacks
  let isValid = false;
  if (!user || !user.isActive) {
    await verifyDummyPassword(password);
  } else {
    isValid = await verifyPassword(user.passwordHash, password);
  }

  if (!isValid || !user || !user.isActive) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  // Generate and store session
  const token = generateSessionToken();
  await createSession(user.id, token);

  // Set HTTP-only cookie
  await setSessionCookie(token);

  return successResponse(
    { user: toSafeUser(user) },
    'Login successful',
    200,
    req
  );
}

export const POST = withApiWrapper(loginHandler);
