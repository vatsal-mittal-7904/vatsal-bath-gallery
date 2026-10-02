'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchApi } from '@/lib/api-client';
import { SafeUser } from '@/features/users/user.types';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextValue {
  user: SafeUser | null;
  state: AuthState;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [state, setState] = useState<AuthState>('loading');

  const refreshUser = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetchApi<{ user: SafeUser }>('/auth/me');
      setUser(response.user);
      setState('authenticated');
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 401) {
        setUser(null);
        setState('unauthenticated');
      } else {
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed', error);
      // Even if it fails (e.g. session already expired), we still clear local state
    } finally {
      setUser(null);
      setState('unauthenticated');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, state, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
