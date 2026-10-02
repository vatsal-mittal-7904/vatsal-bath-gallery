import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../../src/features/auth/auth.guard';
import * as cookieUtils from '../../src/features/auth/cookie.utils';
import * as sessionService from '../../src/features/auth/session.service';
import { Role } from '@prisma/client';

vi.mock('../../src/features/auth/cookie.utils', () => ({
  getSessionCookie: vi.fn(),
}));

vi.mock('../../src/features/auth/session.service', () => ({
  validateSessionToken: vi.fn(),
}));

describe('Auth Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test',
    role: Role.STAFF,
    passwordHash: 'secret',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
  };

  describe('getAuthenticatedUser', () => {
    it('returns null if cookie is missing', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce(undefined);
      const user = await getAuthenticatedUser();
      expect(user).toBeNull();
    });

    it('returns null if session is invalid or revoked', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('invalid-token');
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce(null);
      const user = await getAuthenticatedUser();
      expect(user).toBeNull();
    });

    it('returns SafeUser if session is valid', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('valid-token');
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({
        session: {} as unknown as import('@prisma/client').Session,
        user: mockUser,
      });

      const user = await getAuthenticatedUser();
      expect(user).not.toBeNull();
      expect(user?.email).toBe('test@example.com');
      expect(((user as unknown) as Record<string, unknown>).passwordHash).toBeUndefined(); // SafeUser check
    });
  });

  describe('requireAuthenticatedUser', () => {
    it('throws AppError 401 if unauthenticated', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce(undefined);
      await expect(requireAuthenticatedUser()).rejects.toThrow('Unauthorized');
    });

    it('returns SafeUser if authenticated', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('valid-token');
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({
        session: {} as unknown as import('@prisma/client').Session,
        user: mockUser,
      });
      const user = await requireAuthenticatedUser();
      expect(user).not.toBeNull();
      expect(user.id).toBe('user-123');
    });
  });
});
