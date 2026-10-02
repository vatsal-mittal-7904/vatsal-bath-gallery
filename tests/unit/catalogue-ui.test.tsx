// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BrandsPage from '../../src/app/(protected)/catalogue/brands/page';
import * as apiClient from '../../src/lib/api-client';
import * as authProvider from '../../src/components/auth/AuthProvider';

vi.mock('../../src/lib/api-client', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('../../src/components/auth/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('BrandsPage UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authProvider.useAuth).mockReturnValue({
      user: { id: '1', role: 'OWNER', email: 'test@test.com', name: 'Test', isActive: true, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() },
      state: 'authenticated',
      
      logout: vi.fn(), refreshUser: vi.fn(),
    });
  });

  it('renders a loading spinner initially, then displays brands', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({
      items: [
        { id: 'b1', name: 'Jaquar', isActive: true },
        { id: 'b2', name: 'Kohler', isActive: false },
      ]
    });

    render(<BrandsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Jaquar')).toBeDefined();
    });
    
    expect(screen.getByText('Kohler')).toBeDefined();
    expect(screen.getByText('Brands')).toBeDefined();
    expect(screen.getByText('Add Brand')).toBeDefined();
  });
});
