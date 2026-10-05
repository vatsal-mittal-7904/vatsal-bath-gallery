/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export default function ParchaListPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/parcha-jobs')
      .then(res => setJobs(res.items))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Parcha OCR Jobs</h1>
        <Link href="/parcha/new">
          <Button>Upload New Parcha</Button>
        </Link>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-600 rounded mb-4">{error}</div>}

      {loading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {jobs.map(job => (
              <li key={job.id}>
                <Link href={`/parcha/${job.id}`} className="block hover:bg-gray-50">
                  <div className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-blue-600 truncate">{job.originalFilename}</p>
                      <p className="text-xs text-gray-500 mt-1">Uploaded: {new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-800">
                        {job.status}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {jobs.length === 0 && (
              <li className="p-6 text-center text-gray-500">No parcha jobs found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
