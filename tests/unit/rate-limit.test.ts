import { describe, it, expect } from 'vitest';
import { checkLoginRateLimit } from '../../src/features/auth/rate-limit';

describe('Rate Limit Utility', () => {
  it('blocks after limit exceeded', () => {
    const ip = '192.168.1.100';
    
    // Config default is 5. So 5 should pass, 6th should fail.
    for (let i = 0; i < 5; i++) {
      expect(() => checkLoginRateLimit(ip)).not.toThrow();
    }
    
    expect(() => checkLoginRateLimit(ip)).toThrow(/Too many login attempts/);
  });
});
