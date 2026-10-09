'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

interface ProfitSummary {
  totalBills: number;
  totalRevenue: string;
  totalCost: string;
  totalProfit: string;
  overallMarginPercentage: string;
}

interface ProductProfitBreakdown {
  productName: string;
  variantSku: string;
  unitsSold: string;
  revenue: string;
  cost: string;
  profit: string;
  marginPercentage: string;
}

interface BillProfitLine {
  id: string;
  billNumber: string;
  issueDate: string;
  status: string;
  customer?: { name: string } | null;
  grandTotal: string;
  profit?: {
    totalRevenue: string;
    totalCost: string;
    grossProfit: string;
    marginPercentage: string;
  };
}

interface ProfitReportData {
  summary: ProfitSummary;
  topProducts: ProductProfitBreakdown[];
  allProducts: ProductProfitBreakdown[];
  bills: BillProfitLine[];
}

export default function ProfitReportPage() {
  const { user } = useAuth();
  const canViewProfit = hasPermission(user?.role, 'reports:profit:read');

  const [data, setData] = useState<ProfitReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');

  const loadData = useCallback(async () => {
    if (!canViewProfit) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (status) params.set('status', status);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetchApi<ProfitReportData>(`/reports/profit${qs}`);
      setData(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load profit report');
    } finally {
      setLoading(false);
    }
  }, [canViewProfit, startDate, endDate, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuickFilter = (type: 'today' | 'this_month' | 'all') => {
    if (type === 'today') {
      const today = new Date().toISOString().split('T')[0] ?? '';
      setStartDate(today);
      setEndDate(today);
    } else if (type === 'this_month') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] ?? '';
      const today = now.toISOString().split('T')[0] ?? '';
      setStartDate(firstDay);
      setEndDate(today);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  if (!canViewProfit) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-8 text-center bg-red-50 border-red-200">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-red-900 mb-2">Restricted Access</h2>
          <p className="text-sm text-red-700 max-w-md mx-auto mb-4">
            Profit and wholesale cost margins are strictly confidential business intelligence and require Owner privileges.
          </p>
          <Link href="/">
            <Button variant="secondary">Return to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

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
            <span className="text-slate-900 font-semibold">Profit Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profit & Margin Analytics</h1>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Owner Exclusive
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time gross profit calculations based on invoice revenue and variant wholesale cost prices (COGS).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bills">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200">
              ← Back to Bills
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 font-semibold">
              🏠 Dashboard
            </Button>
          </Link>
        </div>
      </div>


      {/* Filters Card */}
      <Card className="p-4 bg-white border-gray-200 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bill Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border rounded-md focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
            >
              <option value="">Active Bills (Excl. Cancelled)</option>
              <option value="PAID">PAID</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="ISSUED">ISSUED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 pb-0.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleQuickFilter('today')}
              className="text-xs px-2.5 py-1.5"
            >
              Today
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleQuickFilter('this_month')}
              className="text-xs px-2.5 py-1.5"
            >
              This Month
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleQuickFilter('all')}
              className="text-xs px-2.5 py-1.5"
            >
              All Time
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 bg-white border-l-4 border-l-blue-500 shadow-xs">
              <span className="text-xs font-medium text-gray-500 block">Total Bills</span>
              <span className="text-2xl font-bold text-gray-900 mt-1 block">
                {data.summary.totalBills}
              </span>
            </Card>

            <Card className="p-4 bg-white border-l-4 border-l-indigo-500 shadow-xs">
              <span className="text-xs font-medium text-gray-500 block">Merchandise Revenue</span>
              <span className="text-2xl font-bold text-indigo-900 mt-1 block">
                ₹{parseFloat(data.summary.totalRevenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </Card>

            <Card className="p-4 bg-white border-l-4 border-l-amber-500 shadow-xs">
              <span className="text-xs font-medium text-gray-500 block">Wholesale Cost (COGS)</span>
              <span className="text-2xl font-bold text-amber-900 mt-1 block">
                ₹{parseFloat(data.summary.totalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </Card>

            <Card className="p-4 bg-emerald-50/70 border-l-4 border-l-emerald-500 border border-emerald-200 shadow-xs">
              <span className="text-xs font-medium text-emerald-800 block">Gross Profit</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                ₹{parseFloat(data.summary.totalProfit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </Card>

            <Card className="p-4 bg-emerald-50/70 border-l-4 border-l-teal-500 border border-emerald-200 shadow-xs">
              <span className="text-xs font-medium text-emerald-800 block">Overall Margin</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                {data.summary.overallMarginPercentage}%
              </span>
            </Card>
          </div>

          {/* Top Profitable Products */}
          <Card className="p-5 shadow-xs overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🏆</span> Top Profitable Products
              </h2>
              <span className="text-xs text-gray-500">Sorted by gross profit generated</span>
            </div>

            {data.topProducts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No product sales recorded for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-medium border-b">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">SKU / Variant</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-3 text-right">Revenue</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Gross Profit</th>
                      <th className="py-2.5 px-3 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.topProducts.map((p, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{p.productName}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500 font-mono">{p.variantSku}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{p.unitsSold}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">₹{parseFloat(p.revenue).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-500">₹{parseFloat(p.cost).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">₹{parseFloat(p.profit).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{p.marginPercentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Bills Profit Breakdown */}
          <Card className="p-5 shadow-xs overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🧾</span> Invoices Profit Detail
              </h2>
              <span className="text-xs text-gray-500">{data.bills.length} bills</span>
            </div>

            {data.bills.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No bills match the filter criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-medium border-b">
                    <tr>
                      <th className="py-2.5 px-3">Bill #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Bill Total</th>
                      <th className="py-2.5 px-3 text-right">Revenue</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Profit</th>
                      <th className="py-2.5 px-3 text-right">Margin %</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.bills.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-blue-600 font-mono">
                          <Link href={`/bills/${b.id}`} className="hover:underline">
                            {b.billNumber}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">
                          {new Date(b.issueDate).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">
                          {b.customer?.name || 'Walk-in'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          ₹{b.grandTotal}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-700">
                          ₹{b.profit?.totalRevenue || '0.00'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-500">
                          ₹{b.profit?.totalCost || '0.00'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          ₹{b.profit?.grossProfit || '0.00'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                          {b.profit?.marginPercentage || '0.00'}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link href={`/bills/${b.id}`}>
                            <span className="text-xs text-blue-600 hover:text-blue-800 hover:underline">View</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
