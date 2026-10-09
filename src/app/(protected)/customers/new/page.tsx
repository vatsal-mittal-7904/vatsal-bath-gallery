/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ name: '', phoneNumber: '', email: '', address: '', gstin: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApi('/api/v1/customers', { method: 'POST', body: JSON.stringify(data) });
      router.push('/customers');
    } catch (err: any) {
      setError(err.message || 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="hover:text-blue-600 transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/customers" className="hover:text-blue-600 transition-colors">
          Customers
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">New Customer</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Customer Profile</h1>
        <p className="text-xs text-slate-500">Record customer contact information and optional GSTIN registration.</p>
      </div>

      <Card className="p-6 border border-slate-200/90 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-xs p-3 bg-red-50 rounded-lg border border-red-200 mb-4">{error}</div>}
          
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Customer / Firm Name</label>
            <Input required value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="e.g. Ramesh Kumar or Balaji Construction" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
            <Input required value={data.phoneNumber} onChange={e => setData({...data, phoneNumber: e.target.value})} placeholder="10-digit mobile number" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email (Optional)</label>
            <Input type="email" value={data.email} onChange={e => setData({...data, email: e.target.value})} placeholder="name@domain.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Billing Address (Optional)</label>
            <Input value={data.address} onChange={e => setData({...data, address: e.target.value})} placeholder="Shop / Site / Street address" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN Identification (Optional)</label>
            <Input value={data.gstin} onChange={e => setData({...data, gstin: e.target.value})} placeholder="15-character GSTIN" />
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => router.back()} className="text-xs">Cancel</Button>
            <Button type="submit" disabled={loading} className="text-xs">Save Customer</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
