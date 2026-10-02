import { describe, it, expect } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS } from '../../src/features/auth/permissions';
import { Role } from '@prisma/client';

describe('Permissions Registry', () => {
  it('allows OWNER to access OWNER-only permission', () => {
    // OWNER should have 'users:role:update'
    expect(hasPermission(Role.OWNER, 'users:role:update')).toBe(true);
  });

  it('denies STAFF from accessing OWNER-only permission', () => {
    // STAFF should not have 'users:role:update'
    expect(hasPermission(Role.STAFF, 'users:role:update')).toBe(false);
  });

  it('allows STAFF to access shared permissions', () => {
    expect(hasPermission(Role.STAFF, 'dashboard:read')).toBe(true);
    expect(hasPermission(Role.OWNER, 'dashboard:read')).toBe(true);
  });

  it('fails closed for unknown or undefined roles', () => {
    expect(hasPermission(null, 'dashboard:read')).toBe(false);
    expect(hasPermission(undefined, 'dashboard:read')).toBe(false);
    // @ts-expect-error testing invalid role at runtime
    expect(hasPermission('INVALID_ROLE', 'dashboard:read')).toBe(false);
  });

  it('contains no implicit wildcard grants', () => {
    // Check that there is no '*' permission assigned
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      expect(perms).not.toContain('*');
    }
  });
});
