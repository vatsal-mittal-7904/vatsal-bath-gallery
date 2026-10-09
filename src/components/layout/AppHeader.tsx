'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SafeUser } from '@/features/users/user.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';
import { Button } from '@/components/ui/Button';

interface AppHeaderProps {
  user: SafeUser;
}

export function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname();
  const { logout, state } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  };

  const canUploadParcha = hasPermission(user.role, 'parcha:upload');
  const canReadParcha = hasPermission(user.role, 'parcha:read');
  const canReadEstimates = hasPermission(user.role, 'estimates:read');
  const canReadBills = hasPermission(user.role, 'invoices:read');
  const canReadCustomers = hasPermission(user.role, 'customers:read');
  const canReadCatalogue = hasPermission(user.role, 'catalogue:read');
  const canViewProfit = hasPermission(user.role, 'reports:profit:read');

  const navItems = [
    {
      label: 'Parcha OCR',
      href: '/parcha',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      visible: canReadParcha,
      isActive: pathname.startsWith('/parcha'),
    },
    {
      label: 'Estimates',
      href: '/estimates',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      visible: canReadEstimates,
      isActive: pathname.startsWith('/estimates'),
    },
    {
      label: 'Bills',
      href: '/bills',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
      ),
      visible: canReadBills,
      isActive: pathname.startsWith('/bills'),
    },
    {
      label: 'Customers',
      href: '/customers',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      visible: canReadCustomers,
      isActive: pathname.startsWith('/customers'),
    },
    {
      label: 'Catalogue',
      href: '/catalogue',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      visible: canReadCatalogue,
      isActive: pathname.startsWith('/catalogue'),
    },
    {
      label: 'Profit Reports',
      href: '/reports/profit',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      visible: canViewProfit,
      isActive: pathname.startsWith('/reports/profit'),
      badge: 'Owner',
    },
  ];

  const userInitial = (user.name?.[0] || user.email?.[0] || 'U').toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo and Name */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/25 group-hover:scale-105 transition-transform duration-200">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight leading-tight">
                  Vatsal Bath Gallery
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  Business Operational Suite
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1.5 ml-4">
              {navItems
                .filter(item => item.visible)
                .map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      item.isActive
                        ? item.badge === 'Owner'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs'
                          : 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold tracking-wide bg-emerald-100 text-emerald-800 ml-0.5">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {canUploadParcha && (
              <Link href="/parcha/new" className="hidden sm:inline-flex">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold py-1.5 px-3 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Upload Parcha</span>
                </Button>
              </Link>
            )}

            {/* User Pill */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300/80 flex items-center justify-center font-bold text-xs text-slate-700">
                {userInitial}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
                  {user.name || user.email}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    user.role === 'OWNER' ? 'text-emerald-700' : 'text-blue-600'
                  }`}
                >
                  {user.role}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={handleLogout}
              disabled={state === 'loading'}
              className="text-xs px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 shadow-2xs"
              title="Sign Out"
            >
              <span className="hidden sm:inline">Logout</span>
              <svg className="w-3.5 h-3.5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </Button>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-4 space-y-2 shadow-lg animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-900">{user.name || user.email}</p>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">{user.role}</p>
            </div>
            {canUploadParcha && (
              <Link href="/parcha/new" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="text-xs py-1 px-2.5">
                  + Upload Parcha
                </Button>
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {navItems
              .filter(item => item.visible)
              .map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                    item.isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
          </div>
        </div>
      )}
    </header>
  );
}
