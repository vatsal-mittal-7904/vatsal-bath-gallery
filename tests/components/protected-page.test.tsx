// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardClient from '../../src/app/(protected)/DashboardClient';
import { Role } from '@prisma/client';
import * as apiClient from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  fetchApi: vi.fn(),
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially and then healthy state', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({ status: 'ready' });
    
    render(<DashboardClient user={{ id: '1', email: 'test@example.com', name: 'Tester', role: Role.STAFF, isActive: true, lastLoginAt: new Date(), createdAt: new Date(), updatedAt: new Date() }} />);
    
    // Initial state
    expect(screen.getByText('Connecting to services...')).toBeDefined();
    
    // Eventually healthy
    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeDefined();
    });
  });

  it('shows error state when API fails', async () => {
    vi.mocked(apiClient.fetchApi).mockRejectedValueOnce(new Error('Network Error'));
    
    render(<DashboardClient user={{ id: '1', email: 'test@example.com', name: 'Tester', role: Role.STAFF, isActive: true, lastLoginAt: new Date(), createdAt: new Date(), updatedAt: new Date() }} />);
    
    await waitFor(() => {
      expect(screen.getByText('Service Unavailable')).toBeDefined();
      expect(screen.getByText('Network Error')).toBeDefined();
    });
  });
});
