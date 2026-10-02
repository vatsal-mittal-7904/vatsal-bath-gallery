// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import LoginForm from '../../src/app/(public)/login/LoginForm';
import * as apiClient from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  fetchApi: vi.fn(),
}));

const mockRefreshUser = vi.fn();
vi.mock('../../src/components/auth/AuthProvider', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser })
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  })
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders fields and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/Email Address/i)).toBeDefined();
    expect(screen.getByLabelText(/Password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeDefined();
  });

  it('prevents submission if fields are empty', () => {
    render(<LoginForm />);
    const button = screen.getByRole('button', { name: /Sign In/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('submits correctly and navigates on success', async () => {
    vi.mocked(apiClient.fetchApi).mockResolvedValueOnce({});
    
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const button = screen.getByRole('button', { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    fireEvent.click(button);

    await waitFor(() => {
      expect(apiClient.fetchApi).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
      });
      expect(mockRefreshUser).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('displays error on 401', async () => {
    vi.mocked(apiClient.fetchApi).mockRejectedValueOnce({ status: 401 });
    
    render(<LoginForm />);
    
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password.')).toBeDefined();
    });
  });
});
