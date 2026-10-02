import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/features/auth/password.utils';

describe('Password Utilities', () => {
  it('hashes a password and verifies it successfully', async () => {
    const pass = 'super-secret-password';
    const hash = await hashPassword(pass);
    
    // Hash should not equal plain text
    expect(hash).not.toBe(pass);
    
    // Should contain argon2 format string
    expect(hash.startsWith('$argon2')).toBe(true);

    const isValid = await verifyPassword(hash, pass);
    expect(isValid).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-password');
    const isValid = await verifyPassword(hash, 'wrong-password');
    
    expect(isValid).toBe(false);
  });
});
