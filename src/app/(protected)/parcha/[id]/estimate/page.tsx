/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

interface EligibleRow {
  parchaRowId: string;
  sortOrder: number;
  productId: string;
  productName: string;
  variantId: string | null;
  variantSnapshot: string | null;
  skuSnapshot: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitRate: string;
  sourceOriginalText: string;
  sourceRevisedName: string;
  sourceDescription: string;
  sourceSize: string;
}

interface ExcludedRow {
  rowId: string;
  sortOrder: number;
  ocrOriginalText: string;
  productName?: string;
  variantSku?: string;
  rawQuantity?: string;
  reason: 'UNCONFIRMED_PRODUCT' | 'INACTIVE_PRODUCT' | 'INACTIVE_VARIANT' | 'INVALID_QUANTITY';
  reasonDescription: string;
}

interface DraftLineItem {
  id: string; // client-side key
  parchaRowId?: string | null;
  productId?: string;
  variantId?: string | null;
  productSnapshot: string;
  variantSnapshot?: string | null;
  skuSnapshot?: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitRate: string;
  discountAmount: string;
  taxRate: string;
  sourceOriginalText?: string;
  sourceSize?: string;
}

export default function ParchaEstimateDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [job, setJob] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([]);
  
  // Estimate Form State
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [validityDate, setValidityDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<DraftLineItem[]>([]);

  useEffect(() => {
    fetchApi<{
      job: any;
      eligibleRows: EligibleRow[];
      excludedRows: ExcludedRow[];
      customers: any[];
    }>(`/api/v1/parcha-jobs/${id}/estimate`)
      .then(res => {
        setJob(res.job);
        setCustomers(res.customers || []);
        setExcludedRows(res.excludedRows || []);
        setNotes(`Generated from Parcha Job: ${res.job.originalFilename}`);

        // Initialize draft lines from eligible rows
        const initialLines: DraftLineItem[] = res.eligibleRows.map(r => ({
          id: `line-${r.parchaRowId}`,
          parchaRowId: r.parchaRowId,
          productId: r.productId,
          variantId: r.variantId,
          productSnapshot: r.productName,
          variantSnapshot: r.variantSnapshot,
          skuSnapshot: r.skuSnapshot,
          quantity: r.quantity,
          unitOfMeasure: r.unitOfMeasure,
          unitRate: r.unitRate,
          discountAmount: '0',
          taxRate: '0',
          sourceOriginalText: r.sourceOriginalText,
          sourceSize: r.sourceSize,
        }));
        setLines(initialLines);
      })
      .catch(err => setError(err.message || 'Failed to load parcha draft'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleLineChange = (index: number, field: keyof DraftLineItem, value: string) => {
    const updated = [...lines];
    const currentLine = updated[index];
    if (!currentLine) return;
    updated[index] = { ...currentLine, [field]: value } as DraftLineItem;
    setLines(updated);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleAddManualLine = () => {
    setLines([
      ...lines,
      {
        id: `manual-${Date.now()}`,
        productSnapshot: 'Custom Item',
        quantity: '1',
        unitOfMeasure: 'pcs',
        unitRate: '0',
        discountAmount: '0',
        taxRate: '0',
      }
    ]);
  };

  // Phase 5 compliant calculation: round fractional line amount upward to next whole rupee with epsilon safety
  const calculateLineTotal = (line: DraftLineItem) => {
    const qty = parseFloat(line.quantity) || 0;
    const rate = parseFloat(line.unitRate) || 0;
    const discount = parseFloat(line.discountAmount) || 0;
    const taxRate = parseFloat(line.taxRate) || 0;

    const subtotal = Math.ceil(Math.round((qty * rate) * 10000) / 10000);
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round((taxable * (taxRate / 100)) * 100) / 100;
    return Math.ceil(Math.round((taxable + tax) * 10000) / 10000);
  };

  const calculateSubtotal = () => {
    return lines.reduce((sum, line) => {
      const qty = parseFloat(line.quantity) || 0;
      const rate = parseFloat(line.unitRate) || 0;
      return sum + Math.ceil(Math.round((qty * rate) * 10000) / 10000);
    }, 0);
  };

  const calculateDiscountTotal = () => {
    return lines.reduce((sum, line) => sum + (parseFloat(line.discountAmount) || 0), 0);
  };

  const calculateTaxTotal = () => {
    return lines.reduce((sum, line) => {
      const qty = parseFloat(line.quantity) || 0;
      const rate = parseFloat(line.unitRate) || 0;
      const discount = parseFloat(line.discountAmount) || 0;
      const taxRate = parseFloat(line.taxRate) || 0;
      const subtotal = Math.ceil(Math.round((qty * rate) * 10000) / 10000);
      const taxable = Math.max(0, subtotal - discount);
      const lineTax = Math.round((taxable * (taxRate / 100)) * 100) / 100;
      return sum + lineTax;
    }, 0);
  };

  const calculateGrandTotal = () => {
    return lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Please select or add at least one line item for the estimate.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      customerId: customerId || null,
      issueDate: new Date(issueDate || Date.now()).toISOString(),
      validityDate: validityDate ? new Date(validityDate).toISOString() : null,
      notes,
      terms,
      lines: lines.map(l => ({
        parchaRowId: l.parchaRowId || null,
        variantId: l.variantId || null,
        productSnapshot: l.productSnapshot,
        variantSnapshot: l.variantSnapshot || null,
        skuSnapshot: l.skuSnapshot || null,
        quantity: l.quantity,
        unitOfMeasure: l.unitOfMeasure || null,
        unitRate: l.unitRate,
        discountAmount: l.discountAmount || '0',
        taxRate: l.taxRate || '0',
      }))
    };

    try {
      const res = await fetchApi<{ estimate: any }>(`/api/v1/parcha-jobs/${id}/estimate`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'idempotency-key': crypto.randomUUID() }
      });

      router.push(`/estimates/${res.estimate.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save estimate draft');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center">
        <Spinner />
        <span className="mt-4 text-gray-600">Loading parcha estimate draft...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Estimate Draft</h1>
          <p className="text-sm text-gray-500 mt-1">
            Source Parcha: <strong>{job?.originalFilename}</strong> ({job?.status})
          </p>
        </div>
        <Link href={`/parcha/${id}`} className="text-blue-600 hover:underline text-sm font-medium">
          &larr; Return to Parcha Review
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer & Document Information */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">Customer & Dates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer (Optional)</label>
              <select
                className="w-full border border-gray-300 p-2 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer (or leave blank)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phoneNumber ? `(${c.phoneNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
              <Input
                type="date"
                required
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validity Date (Optional)</label>
              <Input
                type="date"
                value={validityDate}
                onChange={e => setValidityDate(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Included Estimate Line Items */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <div>
              <h2 className="text-lg font-semibold">Estimate Line Items</h2>
              <p className="text-xs text-gray-500">
                Review rates, quantities, and discounts. Rates are pre-filled from catalogue selling price when available.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={handleAddManualLine} className="text-sm">
              + Add Custom Line
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No eligible rows selected. Please add a line item or return to review to confirm catalogue matches.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-gray-700 border-b">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Product / Item</th>
                    <th className="py-2 px-3 font-semibold w-24">Qty</th>
                    <th className="py-2 px-3 font-semibold w-20">Unit</th>
                    <th className="py-2 px-3 font-semibold w-28">Rate (₹)</th>
                    <th className="py-2 px-3 font-semibold w-24">Disc (₹)</th>
                    <th className="py-2 px-3 font-semibold w-20">Tax %</th>
                    <th className="py-2 px-3 font-semibold w-28 text-right">Amount (₹)</th>
                    <th className="py-2 px-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((line, idx) => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.productSnapshot}
                          onChange={e => handleLineChange(idx, 'productSnapshot', e.target.value)}
                          className="w-full font-medium p-1 border rounded text-sm mb-1"
                          placeholder="Product Name"
                          required
                        />
                        {line.variantSnapshot && (
                          <div className="text-xs text-blue-700 font-mono">
                            Variant: {line.variantSnapshot}
                          </div>
                        )}
                        {line.sourceOriginalText && (
                          <div className="text-xs text-gray-500 italic mt-0.5 truncate max-w-xs" title={line.sourceOriginalText}>
                            OCR: &ldquo;{line.sourceOriginalText}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.quantity}
                          onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                          className="w-full p-1 border rounded text-sm text-right"
                          required
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.unitOfMeasure}
                          onChange={e => handleLineChange(idx, 'unitOfMeasure', e.target.value)}
                          className="w-full p-1 border rounded text-sm"
                          placeholder="pcs"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.unitRate}
                          onChange={e => handleLineChange(idx, 'unitRate', e.target.value)}
                          className={`w-full p-1 border rounded text-sm text-right ${
                            parseFloat(line.unitRate) === 0 ? 'bg-yellow-50 border-yellow-400' : ''
                          }`}
                          placeholder="0"
                          required
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.discountAmount}
                          onChange={e => handleLineChange(idx, 'discountAmount', e.target.value)}
                          className="w-full p-1 border rounded text-sm text-right"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          value={line.taxRate}
                          onChange={e => handleLineChange(idx, 'taxRate', e.target.value)}
                          className="w-full p-1 border rounded text-sm text-right"
                        />
                      </td>
                      <td className="py-2 px-3 align-top text-right font-semibold text-gray-900">
                        ₹{calculateLineTotal(line).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-2 align-top text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-red-500 hover:text-red-700 font-bold p-1 text-base"
                          title="Remove item"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Document Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-72 bg-gray-50 p-4 rounded-md border space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>₹{calculateSubtotal().toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Discount Total:</span>
                <span>-₹{calculateDiscountTotal().toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax Total:</span>
                <span>+₹{calculateTaxTotal().toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-base text-gray-900">
                <span>Grand Total:</span>
                <span className="text-blue-700">₹{calculateGrandTotal().toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Excluded Parcha Rows (Informative) */}
        {excludedRows.length > 0 && (
          <Card className="p-6 bg-gray-50 border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-semibold text-gray-700">Excluded Parcha Rows ({excludedRows.length})</h2>
              <Link href={`/parcha/${id}`} className="text-xs text-blue-600 hover:underline">
                Resolve in Parcha Matcher &rarr;
              </Link>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              The following rows from the parcha were excluded because they are unconfirmed or missing valid quantities.
            </p>
            <div className="space-y-2">
              {excludedRows.map(row => (
                <div key={row.rowId} className="flex justify-between items-center bg-white p-2 rounded border text-xs">
                  <div>
                    <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600 mr-2">
                      #{row.sortOrder + 1}
                    </span>
                    <span className="font-medium text-gray-800">&ldquo;{row.ocrOriginalText}&rdquo;</span>
                  </div>
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                    {row.reasonDescription}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Notes & Terms */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                className="w-full border border-gray-300 p-2 rounded-md text-sm"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
              <textarea
                className="w-full border border-gray-300 p-2 rounded-md text-sm"
                rows={3}
                value={terms}
                onChange={e => setTerms(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <Link href={`/parcha/${id}`}>
            <Button type="button" variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={saving}>
            Save Estimate Draft
          </Button>
        </div>
      </form>
    </div>
  );
}
