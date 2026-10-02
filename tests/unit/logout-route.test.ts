import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/v1/auth/logout/route';
import * as sessionService from '../../src/features/auth/session.service';
import * as cookieUtils from '../../src/features/auth/cookie.utils';

vi.mock('../../src/features/auth/session.service', () => ({
  revokeSession: vi.fn()
}));

vi.mock('../../src/features/auth/cookie.utils', () => ({
  getSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn()
}));

function createRequest(origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/v1/auth/logout', {
    method: 'POST',
    headers: { origin }
  });
}

describe('Logout Route Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin requests (CSRF origin check)', async () => {
    const req = createRequest('http://evil.com');
    const res = await POST(req, {} as any);
    expect(res.status).toBe(403);
  });

  it('clears cookie even if no token is present', async () => {
    vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce(undefined);
    const req = createRequest();
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(200);
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(cookieUtils.clearSessionCookie).toHaveBeenCalled();
  });

  it('revokes session and clears cookie if token is present', async () => {
    vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('fake-token');
    const req = createRequest();
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(200);
    expect(sessionService.revokeSession).toHaveBeenCalledWith('fake-token');
    expect(cookieUtils.clearSessionCookie).toHaveBeenCalled();
  });

  it('returns 500 but clears cookie if DB revocation fails', async () => {
    vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('fake-token');
    vi.mocked(sessionService.revokeSession).mockRejectedValueOnce(new Error('DB Down'));
    
    const req = createRequest();
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(500);
    expect(cookieUtils.clearSessionCookie).toHaveBeenCalled();
  });
});
