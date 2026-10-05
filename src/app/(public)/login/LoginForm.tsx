'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const validateRedirectUrl = (url: string | null): string => {
    if (!url) return '/';
    // Reject absolute URLs (starting with http://, https://, or //)
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return '/';
    }
    // Ensure it's a relative path starting with /
    if (url.startsWith('/')) {
      return url;
    }
    return '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Email and password are required');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });

      // Refresh the context to get the user
      await refreshUser();
      
      const nextUrl = validateRedirectUrl(searchParams.get('next'));
      router.push(nextUrl);
      // Wait for navigation before resetting state, avoiding flicker
    } catch (error: unknown) {
      setIsLoading(false);
      setPassword(''); // clear password on failure
      
      const err = error as { status?: number };
      if (err.status === 401) {
        setErrorMsg('Invalid email or password.');
      } else if (err.status === 429) {
        setErrorMsg('Too many attempts. Please try again later.');
      } else if (err.status === 400) {
        setErrorMsg('Invalid request format.');
      } else {
        setErrorMsg('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <Card className="w-full max-w-md p-8 sm:p-10 shadow-xl shadow-gray-200/50 border border-gray-200/80 rounded-2xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-4 shadow-xs border border-blue-100">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vatsal Bath Gallery</h1>
        <p className="text-sm text-gray-500 mt-1.5">Sign in to your account</p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3.5 bg-red-50/90 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2.5 shadow-xs" role="alert">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 font-medium">{errorMsg}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email Address"
          type="email"
          id="email"
          placeholder="owner@vatsal.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          id="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600 focus:outline-none p-1 transition-colors"
              title={showPassword ? 'Hide' : 'Show'}
              aria-label={showPassword ? 'Hide' : 'Show'}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          }
        />

        <Button 
          type="submit" 
          className="w-full mt-6 py-2.5 text-sm font-semibold"
          disabled={isLoading || !email || !password}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner className="w-4 h-4" /> Signing in...
            </span>
          ) : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col items-center gap-2 text-center">
        <p className="text-xs text-gray-500">
          Initial Owner: <span className="font-mono text-gray-700 font-medium select-all">owner@vatsal.com</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail('owner@vatsal.com');
            setPassword('Password123!');
            setErrorMsg('');
          }}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline inline-flex items-center gap-1 transition-colors"
        >
          Auto-fill Credentials
        </button>
      </div>
    </Card>
  );
}
