import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedLayout from '../../src/app/(protected)/layout';
import * as authGuard from '../../src/features/auth/auth.guard';
import { redirect } from 'next/navigation';

vi.mock('../../src/features/auth/auth.guard', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('Protected Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login if not authenticated', async () => {
    vi.mocked(authGuard.getAuthenticatedUser).mockResolvedValueOnce(null);
    
    await ProtectedLayout({ children: 'test' });
    
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('renders children if authenticated', async () => {
    vi.mocked(authGuard.getAuthenticatedUser).mockResolvedValueOnce({
      id: '123',
    } as unknown as import('../../src/features/users/user.types').SafeUser);
    
    const result = await ProtectedLayout({ children: 'test content' });
    
    expect(redirect).not.toHaveBeenCalled();
    // Layout renders AppHeader and main element wrapping children
    const [header, main] = result.props.children;
    expect(header.props.user).toEqual({ id: '123' });
    expect(main.props.children).toBe('test content');
  });
});

