/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function BillsPage() {
  const { user } = useAuth();
  const canViewProfit = hasPermission(user?.role, 'reports:profit:read');
  const canCreateBill = hasPermission(user?.role, 'invoices:create');

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/bills')
      .then(res => setBills(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = bills.reduce((acc, b) => acc + (b.profit ? parseFloat(b.profit.totalRevenue) : 0), 0);
  const totalCost = bills.reduce((acc, b) => acc + (b.profit ? parseFloat(b.profit.totalCost) : 0), 0);
  const totalProfit = bills.reduce((acc, b) => acc + (b.profit ? parseFloat(b.profit.grossProfit) : 0), 0);
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0.00';

  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      const matchesSearch =
        bill.billNumber?.toLowerCase().includes(search.toLowerCase()) ||
        bill.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
        bill.customerId?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || bill.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bills, search, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'ISSUED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DRAFT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'CANCELLED':
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
            <span className="text-slate-900 font-semibold">Bills</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tax Invoices & Bills</h1>
          <p className="text-xs text-slate-500">Official sales records, payment settlements, and inventory deductions.</p>
        </div>

        <div className="flex items-center gap-2.5">
          {canViewProfit && (
            <Link href="/reports/profit">
              <Button variant="secondary" className="border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold py-2">
                📈 Profit Reports
              </Button>
            </Link>
          )}
          {canCreateBill && (
            <Link href="/bills/new">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold py-2">
                + New Bill
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Owner Confidential Cumulative Profit Summary */}
      {canViewProfit && bills.length > 0 && bills.some(b => b.profit) && (
        <Card className="p-5 bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-white border border-emerald-200/90 shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
              <span>📊</span> Cumulative Invoiced Profit Summary
            </span>
            <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Owner Confidential
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-emerald-100/80 shadow-2xs">
              <span className="text-xs text-slate-500 block">Total Revenue</span>
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100/80 shadow-2xs">
              <span className="text-xs text-slate-500 block">Wholesale Cost</span>
              <span className="text-base font-bold text-slate-700 font-mono tabular-nums">
                ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100/80 shadow-2xs">
              <span className="text-xs text-slate-500 block">Gross Profit</span>
              <span className="text-base font-bold text-emerald-600 font-mono tabular-nums">
                ₹{totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100/80 shadow-2xs">
              <span className="text-xs text-slate-500 block">Average Margin</span>
              <span className="text-base font-bold text-emerald-700 font-mono tabular-nums">{avgMargin}%</span>
            </div>
          </div>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search by bill number or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {['ALL', 'DRAFT', 'ISSUED', 'PAID', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bills List / Table */}
      {loading ? (
        <div className="flex justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-slate-200/90 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {filteredBills.map(bill => (
              <li key={bill.id}>
                <Link
                  href={`/bills/${bill.id}`}
                  className="block hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-600 font-mono tracking-tight">
                          {bill.billNumber}
                        </span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(bill.status)}`}>
                          {bill.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{bill.customer?.name || bill.customerId || 'Walk-in Customer'}</span>
                        {bill.customer?.phoneNumber && <span className="text-slate-400 ml-2">({bill.customer.phoneNumber})</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Issued: {new Date(bill.issueDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-left sm:text-right space-y-1">
                      <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-900 font-mono tabular-nums">
                          ₹{parseFloat(bill.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={`text-xs font-mono tabular-nums ${parseFloat(bill.balanceDue) > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                          Bal: ₹{parseFloat(bill.balanceDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {canViewProfit && bill.profit && (
                        <p className="text-[11px] font-semibold text-emerald-600 font-mono tabular-nums">
                          Profit: ₹{parseFloat(bill.profit.grossProfit).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({bill.profit.marginPercentage}%)
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {filteredBills.length === 0 && (
              <li className="p-8 text-center text-xs text-slate-500">
                No bills found matching current filter.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
