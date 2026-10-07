/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface MatchingPanelProps {
  jobId: string;
  rowId: string;
  onConfirm: (productId: string | null, variantId: string | null) => void | Promise<void>;
  currentProductId?: string | null;
  currentVariantId?: string | null;
}

export function MatchingPanel({ jobId, rowId, onConfirm, currentProductId, currentVariantId }: MatchingPanelProps) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi<any>(`/parcha-jobs/${jobId}/matching?rowId=${rowId}`);
        const cList = res.candidates || [];
        setCandidates(cList);
        setMessage(res.message || '');

        // Pre-populate default variant selections
        const initialVars: Record<string, string> = {};
        for (const c of cList) {
          if (c.suggestedVariantId) {
            initialVars[c.product.id] = c.suggestedVariantId;
          } else if (c.product.variants && c.product.variants.length > 0) {
            initialVars[c.product.id] = c.product.variants[0].id;
          }
        }
        setSelectedVariants(initialVars);
      } catch (e: any) {
        setError(e.message || 'Failed to load candidates');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId, rowId]);

  const handleConfirmCandidate = async (candidate: any) => {
    const chosenVariantId = selectedVariants[candidate.product.id] || candidate.suggestedVariantId || candidate.product.variants?.[0]?.id || null;
    setConfirmingId(candidate.product.id);
    try {
      await onConfirm(candidate.product.id, chosenVariantId);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleClear = async () => {
    setConfirmingId('clear');
    try {
      await onConfirm(null, null);
    } finally {
      setConfirmingId(null);
    }
  };

  if (loading) return <div className="p-4 flex gap-2 items-center text-sm text-gray-500"><Spinner /> Generating heuristic candidates...</div>;
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;

  return (
    <div className="p-4 bg-blue-50 border-t border-b border-blue-100 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-bold text-blue-900">Catalogue Candidates (Heuristics)</h4>
        {currentProductId && (
          <Button 
            type="button"
            variant="secondary" 
            onClick={handleClear} 
            disabled={confirmingId === 'clear'}
            className="text-xs py-1 h-auto"
          >
            {confirmingId === 'clear' ? 'Clearing...' : 'Clear Confirmation'}
          </Button>
        )}
      </div>

      <p className="text-xs text-blue-700 mb-4">{message}</p>

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No matches found. Staff review required. You may leave this unmatched or revise text.</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c, idx) => {
            const chosenVariantId = selectedVariants[c.product.id] || c.suggestedVariantId || c.product.variants?.[0]?.id || null;
            const isConfirmed = c.product.id === currentProductId && 
              (!c.product.variants?.length || (chosenVariantId || null) === (currentVariantId || null));
            const isThisConfirming = confirmingId === c.product.id;

            return (
              <div 
                key={idx} 
                className={`flex justify-between items-center p-3 rounded border transition-colors ${
                  isConfirmed ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-blue-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    {c.product.name}
                    {isConfirmed && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        ✓ Currently Selected
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {c.product.category?.name} {c.product.brand ? `| ${c.product.brand.name}` : ''}
                  </div>

                  {/* Variant Selection Dropdown if product has variants */}
                  {c.product.variants && c.product.variants.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700">Variant:</span>
                      <select
                        value={chosenVariantId || ''}
                        onChange={e => setSelectedVariants(prev => ({ ...prev, [c.product.id]: e.target.value }))}
                        className="p-1 border border-gray-300 rounded bg-white text-xs font-mono max-w-xs focus:ring-1 focus:ring-blue-500"
                      >
                        {c.product.variants.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.attributes?.size ? `${v.attributes.size} — ` : ''}{v.sku} (₹{v.sellingPrice})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-1 rounded inline-block ${
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
                    type="button"
                    variant={isConfirmed ? 'secondary' : 'primary'}
                    disabled={isThisConfirming}
                    onClick={() => handleConfirmCandidate(c)}
                    className={isConfirmed ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' : ''}
                  >
                    {isThisConfirming ? 'Saving...' : (isConfirmed ? '✓ Confirmed' : 'Confirm')}
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
