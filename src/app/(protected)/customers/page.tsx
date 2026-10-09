/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SafeCustomer } from '@/features/billing/billing.types';
import Link from 'next/link';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<SafeCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: SafeCustomer[] }>('/api/v1/customers?search=' + search);
      setCustomers(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <Link href="/" className="hover:text-blue-600 transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Customers</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Directory</h1>
          <p className="text-xs text-slate-500">Contractors, architects, home owners, and account ledgers.</p>
        </div>

        <Link href="/customers/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold py-2">
            + New Customer
          </Button>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search by customer name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
        />
        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="flex justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-slate-200/90 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {customers.map(customer => (
              <li key={customer.id}>
                <Link
                  href={`/customers/${customer.id}`}
                  className="block hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-sm shrink-0 border border-violet-200">
                        {(customer.name?.[0] || 'C').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {customer.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {customer.phoneNumber || 'No phone'}
                          {customer.email && <span className="ml-2 text-slate-400">• {customer.email}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!customer.isActive ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                          Archived
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      )}
                      <span className="text-slate-400 text-sm hidden sm:inline">→</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {customers.length === 0 && (
              <li className="p-8 text-center text-xs text-slate-500">
                No customers found matching &quot;{search}&quot;.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
