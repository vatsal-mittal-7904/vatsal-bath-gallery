'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
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
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
            Vatsal Bath Gallery
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-gray-600">
            {hasPermission(user.role, 'parcha:read') && (
              <Link href="/parcha" className="hover:text-blue-600 transition-colors flex items-center gap-1.5 font-semibold text-blue-600">
                <span>📸</span> Parcha OCR
              </Link>
            )}
            {hasPermission(user.role, 'estimates:read') && (
              <Link href="/estimates" className="hover:text-blue-600 transition-colors">
                Estimates
              </Link>
            )}
            {hasPermission(user.role, 'invoices:read') && (
              <Link href="/bills" className="hover:text-blue-600 transition-colors">
                Bills
              </Link>
            )}
            {hasPermission(user.role, 'customers:read') && (
              <Link href="/customers" className="hover:text-blue-600 transition-colors">
                Customers
              </Link>
            )}
            {hasPermission(user.role, 'catalogue:read') && (
              <Link href="/catalogue" className="hover:text-blue-600 transition-colors">
                Catalogue
              </Link>
            )}
          </nav>
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
        <Card className="w-full max-w-4xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            
            {hasPermission(user.role, 'parcha:upload') && (
              <Link href="/parcha/new" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer bg-blue-50/80 hover:bg-blue-100/90 border border-blue-200">
                  <span className="text-2xl">📸</span>
                  <span className="font-semibold text-blue-900">Upload Parcha</span>
                </Button>
              </Link>
            )}

            {hasPermission(user.role, 'parcha:read') && (
              <Link href="/parcha" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer">
                  <span className="text-2xl">📋</span>
                  <span>Parcha Jobs</span>
                </Button>
              </Link>
            )}

            {hasPermission(user.role, 'catalogue:read') && (
              <Link href="/catalogue" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer">
                  <span className="text-2xl">📦</span>
                  <span>Catalogue</span>
                </Button>
              </Link>
            )}

            {hasPermission(user.role, 'customers:read') && (
              <Link href="/customers" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer">
                  <span className="text-2xl">👥</span>
                  <span>Customers</span>
                </Button>
              </Link>
            )}

            {hasPermission(user.role, 'estimates:read') && (
              <Link href="/estimates" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer">
                  <span className="text-2xl">📄</span>
                  <span>Estimates</span>
                </Button>
              </Link>
            )}

            {hasPermission(user.role, 'invoices:read') && (
              <Link href="/bills" className="w-full">
                <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 cursor-pointer">
                  <span className="text-2xl">🧾</span>
                  <span>Bills</span>
                </Button>
              </Link>
            )}
            
            {canViewProfit && (
              <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 bg-green-50 hover:bg-green-100 border border-green-200">
                <span className="text-2xl">📈</span>
                <span>Profit Reports</span>
              </Button>
            )}

            {canManageUsers && (
              <Button variant="secondary" className="w-full h-24 flex flex-col gap-2 bg-purple-50 hover:bg-purple-100 border border-purple-200">
                <span className="text-2xl">👥</span>
                <span>Manage Users</span>
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
