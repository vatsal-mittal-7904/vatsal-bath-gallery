// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '../../src/app/(protected)/page';
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
    
    render(<Home />);
    
    // Initial state
    expect(screen.getByText('Connecting to services...')).toBeDefined();
    
    // Eventually healthy
    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeDefined();
    });
  });

  it('shows error state when API fails', async () => {
    vi.mocked(apiClient.fetchApi).mockRejectedValueOnce(new Error('Network Error'));
    
    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText('Service Unavailable')).toBeDefined();
      expect(screen.getByText('Network Error')).toBeDefined();
    });
  });
});
