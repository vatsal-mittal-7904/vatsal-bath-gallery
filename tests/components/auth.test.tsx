// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../../src/components/auth/AuthProvider';
import * as apiClient from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  fetchApi: vi.fn(),
}));

function TestComponent() {
  const { user, state, logout } = useAuth();
  
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="user">{user ? user.email : 'null'}</span>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes as loading, then sets authenticated user on success', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({
      user: { id: '1', email: 'test@example.com', role: 'OWNER' }
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('state').textContent).toBe('loading');

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('authenticated');
      expect(screen.getByTestId('user').textContent).toBe('test@example.com');
    });
  });

  it('sets unauthenticated on 401', async () => {
    vi.mocked(apiClient.fetchApi).mockRejectedValueOnce({ status: 401 });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('unauthenticated');
      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });

  it('handles logout and clears state', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({
      user: { id: '1', email: 'test@example.com' }
    });
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({});

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('state').textContent).toBe('authenticated');
    });

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(apiClient.fetchApi).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
      expect(screen.getByTestId('state').textContent).toBe('unauthenticated');
      expect(screen.getByTestId('user').textContent).toBe('null');
    });
  });
});
