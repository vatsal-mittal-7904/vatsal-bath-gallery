/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/v1/auth/login/route';
import { prisma } from '../../src/lib/db/client';
import * as passwordUtils from '../../src/features/auth/password.utils';
import * as sessionService from '../../src/features/auth/session.service';
import * as cookieUtils from '../../src/features/auth/cookie.utils';

vi.mock('../../src/lib/db/client', () => ({
  prisma: {
    user: { findUnique: vi.fn() }
  }
}));

vi.mock('../../src/features/auth/password.utils', () => ({
  verifyPassword: vi.fn(),
  verifyDummyPassword: vi.fn()
}));

vi.mock('../../src/features/auth/session.service', () => ({
  generateSessionToken: vi.fn(() => 'fake-token'),
  createSession: vi.fn()
}));

vi.mock('../../src/features/auth/cookie.utils', () => ({
  setSessionCookie: vi.fn()
}));

function createRequest(body: any, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify(body)
  });
}

describe('Login Route Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin requests (CSRF origin check)', async () => {
    const req = createRequest({ email: 'test@example.com', password: 'password' }, 'http://evil.com');
    const res = await POST(req, {} as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toBe('Invalid origin');
  });

  it('performs dummy password verification if user does not exist (Timing Attack Mitigation)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    
    const req = createRequest({ email: 'nonexistent@example.com', password: 'password' });
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(401);
    expect(passwordUtils.verifyDummyPassword).toHaveBeenCalledWith('password');
    expect(passwordUtils.verifyPassword).not.toHaveBeenCalled();
  });

  it('performs dummy password verification if user is inactive', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ 
      id: '1', email: 'inactive@example.com', isActive: false 
    } as any);
    
    const req = createRequest({ email: 'inactive@example.com', password: 'password' });
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(401);
    expect(passwordUtils.verifyDummyPassword).toHaveBeenCalledWith('password');
  });

  it('logs in active user successfully and sets HTTP-only cookie', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ 
      id: '1', email: 'active@example.com', isActive: true, passwordHash: 'hash', role: 'OWNER' 
    } as any);
    vi.mocked(passwordUtils.verifyPassword).mockResolvedValueOnce(true);

    const req = createRequest({ email: 'active@example.com', password: 'password' });
    const res = await POST(req, {} as any);
    
    expect(res.status).toBe(200);
    expect(sessionService.createSession).toHaveBeenCalledWith('1', 'fake-token');
    expect(cookieUtils.setSessionCookie).toHaveBeenCalledWith('fake-token');
  });
});
