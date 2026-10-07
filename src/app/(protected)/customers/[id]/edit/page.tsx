/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Customer</h1>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input required value={data.name} onChange={e => setData({...data, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone Number</label>
            <Input required value={data.phoneNumber} onChange={e => setData({...data, phoneNumber: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email (optional)</label>
            <Input type="email" value={data.email} onChange={e => setData({...data, email: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address (optional)</label>
            <Input value={data.address} onChange={e => setData({...data, address: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">GSTIN (optional)</label>
            <Input value={data.gstin} onChange={e => setData({...data, gstin: e.target.value})} />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
