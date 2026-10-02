// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import DashboardClient from '../../src/app/(protected)/DashboardClient';
import { AuthProvider } from '../../src/components/auth/AuthProvider';
import { Role } from '@prisma/client';
import * as apiClient from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  fetchApi: vi.fn(),
}));

describe('Dashboard Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    cleanup();
  });

  const mockUser = { 
    id: '1', 
    email: 'test@example.com', 
    name: 'Tester', 
    role: Role.STAFF, 
    isActive: true, 
    lastLoginAt: new Date(), 
    createdAt: new Date(), 
    updatedAt: new Date() 
  };

  it('shows loading state initially and then healthy state', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({ status: 'ready' });
    
    render(
      <AuthProvider>
        <DashboardClient user={mockUser} />
      </AuthProvider>
    );
    
    expect(screen.getByText('Connecting to services...')).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeDefined();
    });
  });

  it('shows error state when API fails', async () => {
    vi.mocked(apiClient.fetchApi).mockRejectedValueOnce(new Error('Network Error'));
    
    render(
      <AuthProvider>
        <DashboardClient user={mockUser} />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Service Unavailable')).toBeDefined();
      expect(screen.getByText('Network Error')).toBeDefined();
    });
  });
});
