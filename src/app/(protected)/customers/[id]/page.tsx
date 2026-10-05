/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function CustomerDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<{ customer: any }>(`/api/v1/customers/${params.id}`)
      .then(res => setCustomer(res.customer))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this customer?')) return;
    try {
      await fetchApi(`/api/v1/customers/${params.id}/archive`, { method: 'POST' });
      router.push('/customers');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-6"><Spinner /></div>;
  if (!customer) return <div className="p-6">Customer not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <div className="flex gap-2">
          <Link href={`/customers/${customer.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          {customer.isActive && (
            <Button variant="secondary" onClick={handleArchive} className="text-red-600 border-red-200 hover:bg-red-50">Archive</Button>
          )}
        </div>
      </div>
      <Card className="p-6 space-y-4">
        <div><strong className="block text-sm text-gray-500">Phone</strong> {customer.phoneNumber}</div>
        <div><strong className="block text-sm text-gray-500">Email</strong> {customer.email || '-'}</div>
        <div><strong className="block text-sm text-gray-500">Address</strong> {customer.address || '-'}</div>
        <div><strong className="block text-sm text-gray-500">GSTIN</strong> {customer.gstin || '-'}</div>
        <div><strong className="block text-sm text-gray-500">Status</strong> {customer.isActive ? 'Active' : 'Archived'}</div>
      </Card>
    </div>
  );
}
