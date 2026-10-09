'use client';
import React from 'react';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

import { useEffect, useState, use } from 'react';
import { fetchApi } from '@/lib/api-client';
import { MatchingPanel } from '@/features/parcha/components/matching-panel';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function ParchaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null);
  const [extraction, setExtraction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadJob = () => {
    fetchApi<{ parchaJob: any }>(`/api/v1/parcha-jobs/${id}`)
      .then(res => {
        setJob(res.parchaJob);
        if (res.parchaJob.status === 'REVIEW_REQUIRED' || res.parchaJob.status === 'COMPLETED') {
          return fetchApi<any>(`/api/v1/parcha-jobs/${id}/extraction`)
            .then(extRes => setExtraction(extRes));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadJob();
  }, [id]);

  const handleProcess = async () => {
    setIsProcessing(true);
    setError('');
    try {
      await fetchApi(`/api/v1/parcha-jobs/${id}/process`, { method: 'POST' });
      // reload
      loadJob();
    } catch (err: any) {
      setError(err.message || 'Failed to start processing');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoConfirm = async () => {
    setIsAutoMatching(true);
    setError('');
    try {
      const res = await fetchApi<any>(`/api/v1/parcha-jobs/${id}/matching`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      loadJob();
      alert(`Auto-confirmed ${res.matchedCount || 0} catalogue matches!`);
    } catch (err: any) {
      alert('Failed to auto-confirm: ' + (err.message || 'Error'));
    } finally {
      setIsAutoMatching(false);
    }
  };

  const handleSaveRows = async () => {
    setIsSaving(true);
    try {
      await fetchApi(`/api/v1/parcha-jobs/${id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: extraction.rows })
      });
      loadJob();
      alert('Draft saved successfully');
    } catch (err: any) {
      alert('Failed to save draft: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmRowMatch = async (rowIndex: number, productId: string | null, variantId: string | null) => {
    const row = extraction.rows[rowIndex];
    if (!row) return;

    // Functional state update ensures freshest array without race conditions
    setExtraction((prev: any) => {
      if (!prev?.rows) return prev;
      const newRows = [...prev.rows];
      newRows[rowIndex] = { ...newRows[rowIndex], confirmedProductId: productId, confirmedVariantId: variantId };
      return { ...prev, rows: newRows };
    });

    try {
      await fetchApi(`/api/v1/parcha-jobs/${id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({
          rows: [{
            id: row.id,
            version: typeof row.version === 'number' ? row.version : 0,
            revisedProductName: row.revisedProductName ?? null,
            revisedNormalizedProductName: row.revisedNormalizedProductName ?? null,
            revisedBrand: row.revisedBrand ?? null,
            revisedSize: row.revisedSize ?? null,
            revisedQuantity: row.revisedQuantity ?? null,
            revisedUnit: row.revisedUnit ?? null,
            revisedDescription: row.revisedDescription ?? null,
            confirmedProductId: productId ?? null,
            confirmedVariantId: variantId ?? null
          }]
        })
      });

      // Advance version locally on successful save
      setExtraction((prev: any) => {
        if (!prev?.rows) return prev;
        const newRows = [...prev.rows];
        newRows[rowIndex] = {
          ...newRows[rowIndex],
          confirmedProductId: productId,
          confirmedVariantId: variantId,
          version: (newRows[rowIndex].version || 0) + 1
        };
        return { ...prev, rows: newRows };
      });
    } catch (err: any) {
      console.error('Auto-save error on row confirmation:', err);
      alert('Error confirming match: ' + (err.message || 'Unknown error'));
      loadJob();
    }
  };

  const updateRow = (rowIndex: number, field: string, value: any) => {
    setExtraction((prev: any) => {
      if (!prev?.rows) return prev;
      const newRows = [...prev.rows];
      newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
      return { ...prev, rows: newRows };
    });
  };

  if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;
  if (loading || !job) return <div className="p-6 flex justify-center"><Spinner /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/parcha" className="hover:text-blue-600 transition-colors">
            Parcha Jobs
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold font-mono">Job #{job.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/parcha">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200">
              ← Back to Jobs
            </Button>
          </Link>
          <Link href="/parcha/new">
            <Button variant="secondary" className="text-xs px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-semibold">
              📸 New Parcha
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 font-semibold">
              🏠 Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Parcha Verification & Matching</h1>
          <p className="text-xs text-slate-500">Compare original chit image against AI extracted items and assign catalogue matches.</p>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="p-4 bg-gray-50 border border-gray-200 shadow-sm flex flex-col items-center md:col-span-1">
          <h3 className="font-semibold text-gray-700 w-full mb-4">Source Image</h3>
          <div className="w-full bg-white rounded border p-2 flex justify-center min-h-64">
            <img 
              src={`/api/v1/parcha-jobs/${job.id}/image`} 
              alt="Parcha Source" 
              className="max-h-full object-contain rounded"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4 md:col-span-2">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="font-bold text-lg">Status & Metadata</h3>
            {(job.status === 'UPLOADED' || job.status === 'FAILED') && (
              <Button onClick={handleProcess} disabled={isProcessing}>
                {isProcessing ? 'Processing OCR...' : (job.status === 'FAILED' ? 'Retry OCR' : 'Start OCR')}
              </Button>
            )}
            {job.status === 'PROCESSING' && (
              <span className="text-sm font-bold text-blue-600 flex items-center gap-2">
                <Spinner /> Processing...
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-500 font-medium block">Status</span>
              <span className="text-sm font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                {job.status}
              </span>
            </div>
            <div>
              <span className="text-sm text-gray-500 font-medium block">Original File</span>
              <span className="text-sm truncate max-w-xs">{job.originalFilename}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500 font-medium block">Uploaded At</span>
              <span className="text-sm">{new Date(job.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500 font-medium block">Attempts</span>
              <span className="text-sm">{job.processingAttempts || 0}</span>
            </div>
          </div>

          {job.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded">
              <strong>Error:</strong> {job.errorMessage}
            </div>
          )}
        </Card>
      </div>

      {extraction && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">OCR Extraction & Catalogue Review</h3>
            <div className="flex gap-2">
              {job.status === 'REVIEW_REQUIRED' && (
                <>
                  <Button 
                    onClick={handleAutoConfirm} 
                    disabled={isAutoMatching || isSaving} 
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isAutoMatching ? 'Matching...' : '⚡ Auto-Confirm Matches'}
                  </Button>
                  <Button onClick={handleSaveRows} disabled={isSaving || isAutoMatching} variant="secondary">
                    {isSaving ? 'Saving...' : 'Save Draft Edits'}
                  </Button>
                </>
              )}
              {(job.status === 'REVIEW_REQUIRED' || job.status === 'COMPLETED') && (
                <Link href={`/parcha/${job.id}/estimate`}>
                  <Button variant="primary">
                    Create Estimate Draft &rarr;
                  </Button>
                </Link>
              )}
            </div>
          </div>
          
          <p className="text-sm text-gray-500 mb-4">
            Review and correct the extracted values below. These are drafts and are <strong>not verified</strong> against the catalogue yet.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 border font-semibold w-1/4">Original Text / OCR Notes</th>
                  <th className="p-2 border font-semibold">Original Wording</th>
                  <th className="p-2 border font-semibold">Normalized Name</th>
                  <th className="p-2 border font-semibold w-24">Brand</th>
                  <th className="p-2 border font-semibold w-24">Size</th>
                  <th className="p-2 border font-semibold w-20">Qty</th>
                  <th className="p-2 border font-semibold w-20">Unit</th>
                  <th className="p-2 border font-semibold w-32">Catalogue Match</th>
                </tr>
              </thead>
              <tbody>
                {extraction.rows.map((row: any, i: number) => (
                  <React.Fragment key={row.id}>
                  <tr className={`border-b hover:bg-gray-50 ${row.confirmedProductId ? 'bg-green-50' : ''}`}>
                    <td className="p-2 border align-top">
                      <div className="font-mono text-xs bg-gray-100 p-1 rounded mb-1">{row.ocrOriginalText}</div>
                      {row.ocrConfidence && (
                        <div className={`text-[10px] font-bold uppercase px-1 rounded inline-block ${
                          row.ocrConfidence === 'low' ? 'bg-red-100 text-red-700' :
                          row.ocrConfidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {row.ocrConfidence} Conf
                        </div>
                      )}
                      {row.ocrNotes && <div className="text-xs text-red-500 mt-1 italic">{row.ocrNotes}</div>}
                    </td>
                    <td className="p-1 border align-top">
                      <div className="text-[10px] text-gray-500 mb-1" title="OCR Transcription">OCR: {row.ocrProductName || 'N/A'}</div>
                      <input 
                        type="text" 
                        value={row.revisedProductName || ''} 
                        onChange={e => updateRow(i, 'revisedProductName', e.target.value)}
                        className="w-full p-1 border rounded"
                        placeholder="Unknown"
                      />
                    </td>
                    <td className="p-1 border align-top">
                      <div className="text-[10px] text-gray-500 mb-1" title="OCR Normalized Suggestion">OCR: {row.ocrNormalizedProductName || 'N/A'}</div>
                      <input 
                        type="text" 
                        value={row.revisedNormalizedProductName || ''} 
                        onChange={e => updateRow(i, 'revisedNormalizedProductName', e.target.value)}
                        className="w-full p-1 border rounded bg-blue-50"
                        placeholder="Catalogue match hint"
                      />
                    </td>
                    <td className="p-1 border align-top">
                      <input 
                        type="text" 
                        value={row.revisedBrand || ''} 
                        onChange={e => updateRow(i, 'revisedBrand', e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                    <td className="p-1 border align-top">
                      <input 
                        type="text" 
                        value={row.revisedSize || ''} 
                        onChange={e => updateRow(i, 'revisedSize', e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                    <td className="p-1 border align-top">
                      <input 
                        type="text" 
                        value={row.revisedQuantity || ''} 
                        onChange={e => updateRow(i, 'revisedQuantity', e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                    <td className="p-1 border align-top">
                      <input 
                        type="text" 
                        value={row.revisedUnit || ''} 
                        onChange={e => updateRow(i, 'revisedUnit', e.target.value)}
                        className="w-full p-1 border rounded"
                      />
                    </td>
                    <td className="p-1 border align-top text-center align-middle">
                      {row.confirmedProductId ? (
                        <div className="text-[10px] font-bold text-green-700 mb-1">✓ Confirmed</div>
                      ) : null}
                      <Button 
                        variant="secondary" 
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                      >
                        {expandedRow === row.id ? 'Hide Matcher' : (row.confirmedProductId ? 'Edit Match' : 'Find Match')}
                      </Button>
                    </td>
                  </tr>
                  {expandedRow === row.id && (
                    <tr>
                      <td colSpan={8} className="p-0 border-b">
                        <MatchingPanel 
                          jobId={job.id} 
                          rowId={row.id} 
                          currentProductId={row.confirmedProductId}
                          currentVariantId={row.confirmedVariantId}
                          onConfirm={(pId, vId) => {
                            handleConfirmRowMatch(i, pId, vId);
                          }} 
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                ))}
                {extraction.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500">No items detected.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
