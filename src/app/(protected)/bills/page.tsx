/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function BillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/bills')
      .then(res => setBills(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Bills</h1>
        <Link href="/bills/new">
          <Button>New Bill</Button>
        </Link>
      </div>

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
                      <p className="text-sm text-gray-500">Customer: {bill.customer?.name || bill.customerId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">₹{bill.grandTotal} <span className="text-xs font-normal text-gray-500 ml-2">Bal: ₹{bill.balanceDue}</span></p>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100">{bill.status}</span>
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
