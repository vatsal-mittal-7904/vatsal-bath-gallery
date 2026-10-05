/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { SafeCustomer } from '@/features/billing/billing.types';
import Link from 'next/link';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<SafeCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: SafeCustomer[] }>('/api/v1/customers?search=' + search);
      setCustomers(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link href="/customers/new">
          <Button>New Customer</Button>
        </Link>
      </div>

      <Card className="p-4 mb-6">
        <Input 
          placeholder="Search customers..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </Card>

      {loading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {customers.map(customer => (
              <li key={customer.id}>
                <Link href={`/customers/${customer.id}`} className="block hover:bg-gray-50">
                  <div className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-600 truncate">{customer.name}</p>
                      <p className="text-sm text-gray-500">{customer.phoneNumber}</p>
                    </div>
                    <div>
                      {!customer.isActive && <span className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded">Archived</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {customers.length === 0 && (
              <li className="p-6 text-center text-gray-500">No customers found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
