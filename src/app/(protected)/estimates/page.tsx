/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/estimates')
      .then(res => setEstimates(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredEstimates = useMemo(() => {
    return estimates.filter(est => {
      return (
        est.estimateNumber?.toLowerCase().includes(search.toLowerCase()) ||
        est.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
        est.customerId?.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [estimates, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'ISSUED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DRAFT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'EXPIRED':
      case 'REJECTED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

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
            <span className="text-slate-900 font-semibold">Estimates</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotations & Estimates</h1>
          <p className="text-xs text-slate-500">Draft price quotes, customer proposals, and conversion to bills.</p>
        </div>

        <Link href="/estimates/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold py-2">
            + New Estimate
          </Button>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search by estimate # or customer name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
        />
        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Estimates List */}
      {loading ? (
        <div className="flex justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-slate-200/90 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {filteredEstimates.map(est => (
              <li key={est.id}>
                <Link
                  href={`/estimates/${est.id}`}
                  className="block hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-600 font-mono tracking-tight">
                          {est.estimateNumber}
                        </span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(est.status)}`}>
                          {est.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{est.customer?.name || est.customerId || 'Walk-in Customer'}</span>
                        {est.customer?.phoneNumber && <span className="text-slate-400 ml-2">({est.customer.phoneNumber})</span>}
                      </p>
                      {est.createdAt && (
                        <p className="text-[11px] text-slate-400">
                          Created: {new Date(est.createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-sm font-extrabold text-slate-900 font-mono tabular-nums">
                        ₹{parseFloat(est.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {filteredEstimates.length === 0 && (
              <li className="p-8 text-center text-xs text-slate-500">
                No estimates found matching your search.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
