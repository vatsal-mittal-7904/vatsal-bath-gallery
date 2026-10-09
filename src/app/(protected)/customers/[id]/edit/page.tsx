/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ name: '', phoneNumber: '', email: '', address: '', gstin: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi<{ customer: any }>(`/api/v1/customers/${id}`)
      .then(res => {
        const c = res.customer;
        setData({ name: c.name, phoneNumber: c.phoneNumber, email: c.email || '', address: c.address || '', gstin: c.gstin || '' });
      })
      .catch(err => setError(err.message));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApi(`/api/v1/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      router.push(`/customers/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save customer');
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
        <Link href={`/customers/${id}`} className="hover:text-blue-600 transition-colors">
          {data.name || 'Detail'}
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">Edit</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Customer</h1>
        <p className="text-xs text-slate-500">Update contact phone, address, or GSTIN information.</p>
      </div>

      <Card className="p-6 border border-slate-200/90 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-xs p-3 bg-red-50 rounded-lg border border-red-200 mb-4">{error}</div>}
          
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
            <Input required value={data.name} onChange={e => setData({...data, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
            <Input required value={data.phoneNumber} onChange={e => setData({...data, phoneNumber: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email (Optional)</label>
            <Input type="email" value={data.email} onChange={e => setData({...data, email: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Address (Optional)</label>
            <Input value={data.address} onChange={e => setData({...data, address: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN (Optional)</label>
            <Input value={data.gstin} onChange={e => setData({...data, gstin: e.target.value})} />
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => router.back()} className="text-xs">Cancel</Button>
            <Button type="submit" disabled={loading} className="text-xs">Save Changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
