'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SafeUser } from '@/features/users/user.types';

export default function DashboardClient({ user }: { user: SafeUser }) {
  const [status, setStatus] = useState<'loading' | 'healthy' | 'failed'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const checkHealth = async () => {
    setErrorMsg('');
    try {
      await fetchApi<{ status: string }>('/health');
      setStatus('healthy');
    } catch (err: unknown) {
      setStatus('failed');
      setErrorMsg((err as Error).message || 'Failed to connect to backend');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkHealth();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md p-6 text-center space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome, {user.name || user.email}</p>
        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full uppercase tracking-wider">
          {user.role}
        </span>
        
        <div className="py-4 border-t border-b border-gray-100 flex flex-col items-center">
          <p className="text-sm font-medium text-gray-500 mb-2">System Status</p>
          
          {status === 'loading' && (
            <div className="flex items-center text-blue-600 gap-2">
              <Spinner />
              <span>Connecting to services...</span>
            </div>
          )}
          
          {status === 'healthy' && (
            <div className="flex items-center text-green-600 gap-2 font-medium">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>All Systems Operational</span>
            </div>
          )}
          
          {status === 'failed' && (
            <div className="flex flex-col items-center text-red-600 gap-2">
              <div className="flex items-center gap-2 font-medium">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Service Unavailable</span>
              </div>
              <span className="text-xs">{errorMsg}</span>
            </div>
          )}
        </div>

        <Button 
          variant="secondary" 
          onClick={checkHealth}
          disabled={status === 'loading'}
          className="w-full"
        >
          Retry Connection
        </Button>
      </Card>
    </div>
  );
}
