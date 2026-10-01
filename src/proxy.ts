import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from './lib/config/env';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // 1. Generate and propagate Request ID
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  request.headers.set('x-request-id', requestId);
  response.headers.set('x-request-id', requestId);

  // 2. Basic Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // 3. Basic CORS (Restricted to FRONTEND_URL or allow all for simple API, here restricted)
  // We set basic CORS if it's an API request
  if (request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('Access-Control-Allow-Origin', env.FRONTEND_URL);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
  }

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api')) {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  return response;
}

// Only run middleware on API routes (and potentially other routes later)
export const config = {
  matcher: '/api/:path*',
};
