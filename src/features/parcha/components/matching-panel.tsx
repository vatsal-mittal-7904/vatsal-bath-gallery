/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface MatchingPanelProps {
  jobId: string;
  rowId: string;
  onConfirm: (productId: string | null, variantId: string | null) => void;
  currentProductId?: string | null;
  currentVariantId?: string | null;
}

export function MatchingPanel({ jobId, rowId, onConfirm, currentProductId, currentVariantId }: MatchingPanelProps) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi<any>(`/parcha-jobs/${jobId}/matching?rowId=${rowId}`);
        setCandidates(res.candidates || []);
        setMessage(res.message || '');
      } catch (e: any) {
        setError(e.message || 'Failed to load candidates');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId, rowId]);

  if (loading) return <div className="p-4 flex gap-2 items-center text-sm text-gray-500"><Spinner /> Generating heuristic candidates...</div>;
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;

  return (
    <div className="p-4 bg-blue-50 border-t border-b border-blue-100 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-bold text-blue-900">Catalogue Candidates (Heuristics)</h4>
        {currentProductId && (
          <Button variant="secondary" onClick={() => onConfirm(null, null)} className="text-xs py-1 h-auto">
            Clear Confirmation
          </Button>
        )}
      </div>

      <p className="text-xs text-blue-700 mb-4">{message}</p>

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No matches found. Staff review required. You may leave this unmatched or revise text.</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c, idx) => {
            const isConfirmed = c.product.id === currentProductId && c.suggestedVariantId === currentVariantId;
            return (
              <div key={idx} className={`flex justify-between items-center p-3 rounded border ${isConfirmed ? 'bg-green-100 border-green-300' : 'bg-white border-blue-200'}`}>
                <div>
                  <div className="font-semibold text-gray-900">{c.product.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.product.category?.name} {c.product.brand ? `| ${c.product.brand.name}` : ''}
                  </div>
                  {c.suggestedVariantId && c.product.variants && (
                    <div className="mt-1 text-xs bg-gray-100 p-1 rounded inline-block">
                      Matched Variant: {c.product.variants.find((v:any) => v.id === c.suggestedVariantId)?.sku}
                    </div>
                  )}
                  <div className="mt-1">
                    <span className={`text-[10px] font-bold uppercase px-1 rounded inline-block mr-2 ${
                      c.confidence === 'high' ? 'bg-green-100 text-green-700' :
                      c.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {c.confidence} Indicator
                    </span>
                    <span className="text-xs italic text-gray-500">{c.explanation}</span>
                  </div>
                </div>
                <div>
                  <Button 
                    variant={isConfirmed ? 'secondary' : 'primary'}
                    onClick={() => onConfirm(c.product.id, c.suggestedVariantId || null)}
                  >
                    {isConfirmed ? 'Confirmed' : 'Confirm'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
