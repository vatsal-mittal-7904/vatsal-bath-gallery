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
    <Card className="w-full max-w-md p-8 shadow-lg">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vatsal Bath Gallery</h1>
        <p className="text-sm text-gray-500 mt-2">Sign in to your account</p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded" role="alert">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email Address"
          type="email"
          id="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        
        <Input
          label="Password"
          type="password"
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />

        <Button 
          type="submit" 
          className="w-full mt-6"
          disabled={isLoading || !email || !password}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner className="w-4 h-4" /> Signing in...
            </span>
          ) : 'Sign In'}
        </Button>
      </form>
    </Card>
  );
}
