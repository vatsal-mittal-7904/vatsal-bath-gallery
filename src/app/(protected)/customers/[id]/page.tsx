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

  if (loading) return <div className="p-6"><Spinner /></div>;
  if (!customer) return <div className="p-6">Customer not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Quick Navigation & Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600 flex items-center gap-1.5 font-semibold text-gray-800">
            <span>🏠</span> Home
          </Link>
          <span>/</span>
          <Link href="/customers" className="hover:text-blue-600 font-medium">
            Customers
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-bold">{customer.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold bg-white hover:bg-gray-100 border-gray-300 shadow-xs">
              <span>🏠</span> Main Homepage
            </Button>
          </Link>
          <Link href="/customers">
            <Button variant="secondary" className="text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium bg-white hover:bg-gray-100 border-gray-300 shadow-xs">
              <span>←</span> All Customers
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="secondary" className="text-sm font-semibold flex items-center gap-1 bg-white hover:bg-gray-100 border-gray-300">
              <span>🏠</span> Home
            </Button>
          </Link>
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
