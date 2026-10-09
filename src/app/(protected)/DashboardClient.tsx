'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { SafeUser } from '@/features/users/user.types';
import { hasPermission } from '@/features/auth/permissions';

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

  const canUploadParcha = hasPermission(user.role, 'parcha:upload');
  const canReadParcha = hasPermission(user.role, 'parcha:read');
  const canReadEstimates = hasPermission(user.role, 'estimates:read');
  const canCreateBills = hasPermission(user.role, 'invoices:create');
  const canReadBills = hasPermission(user.role, 'invoices:read');
  const canReadCustomers = hasPermission(user.role, 'customers:read');
  const canReadCatalogue = hasPermission(user.role, 'catalogue:read');
  const canViewProfit = hasPermission(user.role, 'reports:profit:read');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Executive Welcome Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-6 sm:p-8 text-white shadow-md border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-blue-200 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Point of Sale & AI Estimating Suite</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {user.name || user.email}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Manage handwritten parcha digitizations, instant customer estimates, GST invoices, and live warehouse inventory in one unified system.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canUploadParcha && (
              <Link href="/parcha/new">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Upload Parcha</span>
                </Button>
              </Link>
            )}
            {canCreateBills && (
              <Link href="/bills/new">
                <Button variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-sm flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>New Bill</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Operational Launchpad Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Parcha OCR Hub */}
        <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-slate-200/90 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl border border-blue-100 shadow-2xs">
              📸
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Parcha AI Digitization</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Gemini-powered multimodal extraction converts handwritten contractor chits into structured line items automatically.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            {canUploadParcha && (
              <Link href="/parcha/new" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                + Upload New
              </Link>
            )}
            {canReadParcha && (
              <Link href="/parcha" className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <span>View Jobs</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </Card>

        {/* Estimates Hub */}
        <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-slate-200/90 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl border border-amber-100 shadow-2xs">
              📄
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Quotations & Estimates</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Generate clean, professional price quotes with catalogue pricing, custom rates, and instant PDF/print views.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <Link href="/estimates/new" className="text-xs font-semibold text-amber-600 hover:text-amber-800">
              + New Estimate
            </Link>
            {canReadEstimates && (
              <Link href="/estimates" className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <span>All Estimates</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </Card>

        {/* Billing & Invoicing Hub */}
        <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-slate-200/90 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-xl border border-sky-100 shadow-2xs">
              🧾
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">GST Bills & Invoices</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Issue tax invoices, track partial payments, deduct warehouse stock automatically, and maintain balance ledgers.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            {canCreateBills && (
              <Link href="/bills/new" className="text-xs font-semibold text-sky-600 hover:text-sky-800">
                + New Bill
              </Link>
            )}
            {canReadBills && (
              <Link href="/bills" className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <span>All Bills</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </Card>

        {/* Customer Accounts */}
        <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-slate-200/90 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-xl border border-violet-100 shadow-2xs">
              👥
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Customers & Khata</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Maintain contractor and homeowner profiles, GSTIN identification, addresses, and full purchasing history.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <Link href="/customers/new" className="text-xs font-semibold text-violet-600 hover:text-violet-800">
              + New Customer
            </Link>
            {canReadCustomers && (
              <Link href="/customers" className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <span>View Directory</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </Card>

        {/* Catalogue & Inventory */}
        <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-slate-200/90 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl border border-emerald-100 shadow-2xs">
              📦
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Catalogue & Warehouses</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Centralized repository of tiles, sanitaryware, fittings, SKU variants, and stock balances across store locations.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            {canReadCatalogue && (
              <Link href="/catalogue/products" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">
                Browse Products
              </Link>
            )}
            <Link href="/catalogue" className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
              <span>Overview</span>
              <span>→</span>
            </Link>
          </div>
        </Card>

        {/* Owner Executive Intelligence (Role-gated) */}
        {canViewProfit && (
          <Card className="p-6 hover:shadow-md transition-shadow duration-200 border border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-white flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl border border-emerald-200 shadow-2xs">
                  📈
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                  Owner Confidential
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Profit & Margin Intelligence</h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Real-time gross margin tracking, wholesale cost vs retail revenue reconciliation, and top performing product analytics.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-emerald-200 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-emerald-800">Protected financial metrics</span>
              <Link href="/reports/profit" className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
                <span>Open Analytics</span>
                <span>→</span>
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* System Status & Connectivity Bar */}
      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            {status === 'loading' && (
              <div className="flex items-center text-blue-600 gap-2">
                <Spinner className="w-4 h-4" />
                <span className="text-xs font-semibold">Connecting to services...</span>
              </div>
            )}
            {status === 'healthy' && (
              <div className="flex items-center text-emerald-600 gap-2 font-medium">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
                <span className="text-xs font-semibold">All Systems Operational</span>
              </div>
            )}
            {status === 'failed' && (
              <div className="flex flex-col text-red-600">
                <div className="flex items-center gap-2 font-medium">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                  <span className="text-xs font-semibold">Service Unavailable</span>
                </div>
                <span className="text-xs text-red-500 mt-0.5">{errorMsg}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">
              PostgreSQL Database • Gemini 2.5 Flash OCR Engine • Prisma ORM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={checkHealth}
            disabled={status === 'loading'}
            className="text-xs py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          >
            Retry Connection
          </Button>
        </div>
      </Card>

    </div>
  );
}
