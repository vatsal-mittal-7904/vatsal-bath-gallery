/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useEffect, useState } from 'react';
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

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          <p className="text-sm text-gray-500">Invoices, payment balances, and financial records.</p>
        </div>
        <div className="flex gap-3">
          {canViewProfit && (
            <Link href="/reports/profit">
              <Button variant="secondary" className="border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100">
                📈 Profit Reports
              </Button>
            </Link>
          )}
          <Link href="/bills/new">
            <Button>New Bill</Button>
          </Link>
        </div>
      </div>

      {canViewProfit && bills.length > 0 && bills.some(b => b.profit) && (
        <Card className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
              <span>📊</span> Cumulative Invoiced Profit Summary
            </span>
            <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded uppercase">
              Owner Confidential
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
              <span className="text-xs text-gray-500 block">Total Revenue</span>
              <span className="text-base font-bold text-gray-900">₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
              <span className="text-xs text-gray-500 block">Total Wholesale Cost</span>
              <span className="text-base font-bold text-gray-700">₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
              <span className="text-xs text-gray-500 block">Total Gross Profit</span>
              <span className="text-base font-bold text-emerald-600">₹{totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
              <span className="text-xs text-gray-500 block">Average Margin</span>
              <span className="text-base font-bold text-emerald-700">{avgMargin}%</span>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {bills.map(bill => (
              <li key={bill.id}>
                <Link href={`/bills/${bill.id}`} className="block hover:bg-gray-50">
                  <div className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-600 truncate">{bill.billNumber}</p>
                      <p className="text-sm text-gray-500">Customer: {bill.customer?.name || bill.customerId || 'Walk-in'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(bill.issueDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-sm font-bold">₹{bill.grandTotal} <span className="text-xs font-normal text-gray-500 ml-2">Bal: ₹{bill.balanceDue}</span></p>
                      {canViewProfit && bill.profit && (
                        <p className="text-xs font-semibold text-emerald-600 font-mono">
                          Profit: ₹{bill.profit.grossProfit} ({bill.profit.marginPercentage}%)
                        </p>
                      )}
                      <div>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 font-medium">{bill.status}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {bills.length === 0 && (
              <li className="p-6 text-center text-gray-500">No bills found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
