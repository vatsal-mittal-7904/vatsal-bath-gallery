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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'REVIEW_REQUIRED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'PROCESSING':
      case 'EXTRACTED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'FAILED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <Link href="/" className="hover:text-blue-600 transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Parcha OCR</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Handwritten Parcha Jobs</h1>
          <p className="text-xs text-slate-500">AI-extracted contractor slips, catalogue item matches, and verified drafts.</p>
        </div>

        <Link href="/parcha/new">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold py-2 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>Upload New Parcha</span>
          </Button>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200 shadow-2xs">
          {error}
        </div>
      )}

      {/* Jobs List */}
      {loading ? (
        <div className="flex justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white shadow-xs rounded-xl border border-slate-200/90 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {jobs.map(job => (
              <li key={job.id}>
                <Link
                  href={`/parcha/${job.id}`}
                  className="block hover:bg-slate-50/80 transition-colors px-4 py-4 sm:px-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        📸
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {job.originalFilename}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Uploaded: {new Date(job.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(job.status)}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400 text-sm hidden sm:inline">→</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {jobs.length === 0 && (
              <li className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                  📋
                </div>
                <p className="text-xs text-slate-500 font-medium">No parcha OCR jobs found yet.</p>
                <Link href="/parcha/new">
                  <Button size="sm" className="text-xs">
                    Upload Your First Parcha
                  </Button>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
