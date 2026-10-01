import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy as middleware } from '../../src/proxy';

describe('Middleware', () => {
  it('adds security headers and x-request-id', () => {
    const req = new NextRequest('http://localhost/api/v1/health');
    const res = middleware(req);
    
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
  });

  it('handles CORS for API routes', () => {
    const req = new NextRequest('http://localhost/api/v1/health', { method: 'OPTIONS' });
    const res = middleware(req);
    
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('ignores CORS for non-API routes due to config matcher', () => {
    // Note: The config matcher is handled by Next.js router, not the middleware function itself.
    // Our middleware function has an explicit check for '/api' just in case.
    const req = new NextRequest('http://localhost/about');
    const res = middleware(req);
    
    expect(res.headers.get('access-control-allow-methods')).toBeNull();
  });
});
