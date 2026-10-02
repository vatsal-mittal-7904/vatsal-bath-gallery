import { cookies } from 'next/headers';
import { env } from '@/lib/config/env';

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  const isProd = env.NODE_ENV === 'production';
  
  // In production, use __Host- prefix if possible (requires Secure and Path=/). 
  // Next.js handles the logic nicely but we enforce secure props.
  const cookieName = isProd ? `__Host-${env.AUTH_COOKIE_NAME}` : env.AUTH_COOKIE_NAME;

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const isProd = env.NODE_ENV === 'production';
  const cookieName = isProd ? `__Host-${env.AUTH_COOKIE_NAME}` : env.AUTH_COOKIE_NAME;

  cookieStore.set(cookieName, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const isProd = env.NODE_ENV === 'production';
  const cookieName = isProd ? `__Host-${env.AUTH_COOKIE_NAME}` : env.AUTH_COOKIE_NAME;
  
  return cookieStore.get(cookieName)?.value;
}
