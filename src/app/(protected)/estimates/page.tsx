/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/estimates')
      .then(res => setEstimates(res.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Estimates</h1>
        <Link href="/estimates/new">
          <Button>New Estimate</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {estimates.map(est => (
              <li key={est.id}>
                <Link href={`/estimates/${est.id}`} className="block hover:bg-gray-50">
                  <div className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-600 truncate">{est.estimateNumber}</p>
                      <p className="text-sm text-gray-500">Customer: {est.customer?.name || est.customerId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">₹{est.grandTotal}</p>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100">{est.status}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {estimates.length === 0 && (
              <li className="p-6 text-center text-gray-500">No estimates found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
