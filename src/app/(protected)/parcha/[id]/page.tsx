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

  const handleSaveRows = async () => {
    setIsSaving(true);
    try {
      await fetchApi(`/api/v1/parcha-jobs/${id}/extraction`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: extraction.rows })
      });
      alert('Draft saved successfully');
    } catch (err: any) {
      alert('Failed to save draft: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateRow = (rowIndex: number, field: string, value: string) => {
    const newRows = [...extraction.rows];
    newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
    setExtraction({ ...extraction, rows: newRows });
  };

  if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;
  if (loading || !job) return <div className="p-6 flex justify-center"><Spinner /></div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Parcha Job Details</h1>
        <Link href="/parcha" className="text-blue-600 hover:underline text-sm font-medium">
          &larr; Back to List
        </Link>
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
                <Button onClick={handleSaveRows} disabled={isSaving} variant="secondary">
                  {isSaving ? 'Saving...' : 'Save Draft Edits'}
                </Button>
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
                            updateRow(i, "confirmedProductId", pId as any);
                            updateRow(i, "confirmedVariantId", vId as any);
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
