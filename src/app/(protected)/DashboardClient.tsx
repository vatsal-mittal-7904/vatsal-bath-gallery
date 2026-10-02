'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SafeUser } from '@/features/users/user.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function DashboardClient({ user }: { user: SafeUser }) {
  const [status, setStatus] = useState<'loading' | 'healthy' | 'failed'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  
  const { logout, state } = useAuth();

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

  const handleLogout = async () => {
    await logout();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login'; // hard navigate to clear state safely
  };

  // Example of Role-Aware UI visibility
  const canViewProfit = hasPermission(user.role, 'reports:profit:read');
  const canManageUsers = hasPermission(user.role, 'users:role:update');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vatsal Bath Gallery</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-semibold rounded uppercase tracking-wider">
              {user.role}
            </span>
          </div>
          <Button variant="secondary" onClick={handleLogout} disabled={state === 'loading'}>
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-grow p-6 flex flex-col items-center justify-start mt-8">
        <Card className="w-full max-w-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="secondary" className="w-full h-24 flex flex-col gap-2">
              <span>📦</span> Catalogue
            </Button>
            <Button variant="secondary" className="w-full h-24 flex flex-col gap-2">
              <span>📄</span> Estimates
            </Button>
            
            {canViewProfit && (
              <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 bg-green-50 hover:bg-green-100 border-green-200">
                <span>📈</span> Profit Reports
              </Button>
            )}

            {canManageUsers && (
              <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 bg-purple-50 hover:bg-purple-100 border-purple-200">
                <span>👥</span> Manage Users
              </Button>
            )}
          </div>
        </Card>

        <Card className="w-full max-w-2xl p-6 text-center space-y-6">
          <div className="py-4 flex flex-col items-center">
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
            className="w-full max-w-xs mx-auto"
          >
            Retry Connection
          </Button>
        </Card>
      </main>
    </div>
  );
}
