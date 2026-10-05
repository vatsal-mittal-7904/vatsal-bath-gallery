/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthenticatedUser, requireAuthenticatedUser, requirePermission, hasRequiredPermission } from '../../src/features/auth/auth.guard';
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

  const mockStaff = {
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

  const mockOwner = {
    ...mockStaff,
    id: 'user-456',
    role: Role.OWNER,
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
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({ session: {} as any, user: mockStaff } as any);

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
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({ session: {} as any, user: mockStaff } as any);
      const user = await requireAuthenticatedUser();
      expect(user).not.toBeNull();
      expect(user.id).toBe('user-123');
    });
  });

  describe('requirePermission', () => {
    it('allows OWNER to pass OWNER-only check', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('valid-token');
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({ session: {} as any, user: mockOwner } as any);

      const user = await requirePermission('users:role:update');
      expect(user.role).toBe(Role.OWNER);
    });

    it('denies STAFF from OWNER-only check and throws 403', async () => {
      vi.mocked(cookieUtils.getSessionCookie).mockResolvedValueOnce('valid-token');
      vi.mocked(sessionService.validateSessionToken).mockResolvedValueOnce({ session: {} as any, user: mockStaff } as any);

      await expect(requirePermission('users:role:update')).rejects.toThrow('Forbidden: Insufficient permissions');
    });
  });

  describe('hasRequiredPermission', () => {
    it('returns boolean without throwing', () => {
      expect(hasRequiredPermission(null, 'dashboard:read')).toBe(false);
      expect(hasRequiredPermission(mockStaff as unknown as import('../../src/features/users/user.types').SafeUser, 'users:role:update')).toBe(false);
      expect(hasRequiredPermission(mockOwner as unknown as import('../../src/features/users/user.types').SafeUser, 'users:role:update')).toBe(true);
    });
  });
});
