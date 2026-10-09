/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<{ customer: any }>(`/api/v1/customers/${id}`)
      .then(res => setCustomer(res.customer))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this customer?')) return;
    try {
      await fetchApi(`/api/v1/customers/${id}/archive`, { method: 'POST' });
      router.push('/customers');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-xs text-slate-500">
        Customer record not found.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/customers" className="hover:text-blue-600 transition-colors">
            Customers
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold">{customer.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/customers">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200">
              ← Back to Directory
            </Button>
          </Link>
          <Link href={`/customers/${customer.id}/edit`}>
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200">
              Edit
            </Button>
          </Link>
          {customer.isActive && (
            <Button
              variant="secondary"
              onClick={handleArchive}
              className="text-xs px-3 py-1.5 text-red-600 border-red-200 hover:bg-red-50"
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Customer Header Card */}
      <Card className="p-6 border border-slate-200/90 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center font-extrabold text-2xl shadow-sm shrink-0">
            {(customer.name?.[0] || 'C').toUpperCase()}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              {customer.isActive ? (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                  Archived
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Customer ID: <code className="text-slate-700 font-mono">{customer.id}</code></p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Phone Number</span>
            <span className="text-sm font-semibold text-slate-800">{customer.phoneNumber || '—'}</span>
          </div>
          <div className="bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Email Address</span>
            <span className="text-sm font-semibold text-slate-800">{customer.email || '—'}</span>
          </div>
          <div className="bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">GSTIN Identification</span>
            <span className="text-sm font-semibold text-slate-800 font-mono">{customer.gstin || 'Unregistered'}</span>
          </div>
          <div className="bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Billing Address</span>
            <span className="text-sm font-semibold text-slate-800">{customer.address || '—'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
