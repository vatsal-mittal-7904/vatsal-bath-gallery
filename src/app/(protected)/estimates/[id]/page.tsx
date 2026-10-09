/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

interface LineItemEdit {
  id?: string;
  parchaRowId?: string | null;
  productSnapshot: string;
  variantSnapshot?: string | null;
  skuSnapshot?: string | null;
  variantId?: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitRate: string;
  discountAmount: string;
  taxRate: string;
}

export default function EstimateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [estimate, setEstimate] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Convert to Bill state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for edits
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [validityDate, setValidityDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [terms, setTerms] = useState<string>('');
  const [editableLines, setEditableLines] = useState<LineItemEdit[]>([]);

  const loadEstimate = () => {
    fetchApi<{ estimate: any }>(`/api/v1/estimates/${id}`)
      .then(res => {
        const est = res.estimate;
        setEstimate(est);
        initFormState(est);
        setError(null);
        setErrorStatus(null);
        setConflictError(null);
        setValidationError(null);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load estimate');
        setErrorStatus(err.status || err.statusCode || null);
      })
      .finally(() => setLoading(false));
  };

  const loadCustomers = () => {
    fetchApi<{ items: any[] }>('/api/v1/customers')
      .then(res => setCustomers(res.items.filter((c: any) => c.isActive)))
      .catch(console.error);
  };

  const initFormState = (est: any) => {
    setSelectedCustomerId(est.customerId || '');
    setIssueDate(est.issueDate ? new Date(est.issueDate).toISOString().split('T')[0]! : '');
    setValidityDate(est.validityDate ? new Date(est.validityDate).toISOString().split('T')[0]! : '');
    setNotes(est.notes || '');
    setTerms(est.terms || '');
    setEditableLines(
      (est.lines || []).map((l: any) => ({
        id: l.id,
        parchaRowId: l.parchaRowId || null,
        productSnapshot: l.productSnapshot || '',
        variantSnapshot: l.variantSnapshot || null,
        skuSnapshot: l.skuSnapshot || null,
        variantId: l.variantId || null,
        quantity: l.quantity || '1',
        unitOfMeasure: l.unitOfMeasure || '',
        unitRate: l.unitRate || '0',
        discountAmount: l.discountAmount || '0',
        taxRate: l.taxRate || '0'
      }))
    );
  };

  useEffect(() => {
    loadEstimate();
    loadCustomers();
  }, [id]);

  const handleStatus = async (status: string) => {
    try {
      await fetchApi(`/api/v1/estimates/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, version: estimate?.version ?? 0 })
      });
      loadEstimate();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenConvertModal = () => {
    setConvertError(null);
    setShowConvertModal(true);
  };

  const handleConfirmConvert = async () => {
    if (!estimate) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      const res = await fetchApi<{ bill: any }>(`/api/v1/estimates/${id}/convert`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: estimate.version })
      });
      router.push(`/bills/${res.bill.id}`);
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.message?.toLowerCase().includes('conflict') ||
        err.message?.toLowerCase().includes('version') ||
        err.message?.toLowerCase().includes('already converted')
      ) {
        setConflictError(err.message || 'Estimate was modified concurrently or has already been converted.');
        setShowConvertModal(false);
      } else {
        setConvertError(err.message || 'Failed to convert estimate to bill.');
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handleLineChange = (index: number, field: keyof LineItemEdit, value: string) => {
    setEditableLines(prev => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const handleAddLine = () => {
    setEditableLines(prev => [
      ...prev,
      {
        parchaRowId: null,
        productSnapshot: 'Manual Item',
        variantSnapshot: null,
        skuSnapshot: null,
        variantId: null,
        quantity: '1',
        unitOfMeasure: 'pcs',
        unitRate: '0',
        discountAmount: '0',
        taxRate: '0'
      }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (editableLines.length <= 1) {
      alert('An estimate must contain at least one line item.');
      return;
    }
    setEditableLines(prev => prev.filter((_, i) => i !== index));
  };

  // Phase 5 Upward Ceiling preview calculation
  const calculatePreviewLine = (line: LineItemEdit) => {
    const qty = parseFloat(line.quantity) || 0;
    const rate = parseFloat(line.unitRate) || 0;
    const subtotal = Math.ceil(qty * rate - 1e-9);
    const discount = parseFloat(line.discountAmount) || 0;
    const taxRate = parseFloat(line.taxRate) || 0;

    const taxable = Math.max(0, subtotal - discount);
    const taxAmount = (taxable * taxRate) / 100;
    const lineAmount = Math.ceil(taxable + taxAmount - 1e-9);

    return { subtotal, discount, taxAmount, lineAmount };
  };

  const previewTotals = editableLines.reduce(
    (acc, l) => {
      const calc = calculatePreviewLine(l);
      acc.subtotal += calc.subtotal;
      acc.discountTotal += calc.discount;
      acc.taxTotal += calc.taxAmount;
      acc.grandTotal += calc.lineAmount;
      return acc;
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
  );

  const handleCancelEdit = () => {
    initFormState(estimate);
    setIsEditing(false);
    setValidationError(null);
    setConflictError(null);
  };

  const handleSaveEdit = async () => {
    setValidationError(null);
    setConflictError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    const payload = {
      version: estimate.version,
      customerId: selectedCustomerId || null,
      issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
      validityDate: validityDate ? new Date(validityDate).toISOString() : null,
      notes: notes || null,
      terms: terms || null,
      lines: editableLines.map(l => ({
        id: l.id,
        parchaRowId: l.parchaRowId || null,
        productSnapshot: l.productSnapshot,
        variantSnapshot: l.variantSnapshot || null,
        skuSnapshot: l.skuSnapshot || null,
        variantId: l.variantId || null,
        quantity: l.quantity,
        unitOfMeasure: l.unitOfMeasure || null,
        unitRate: l.unitRate,
        discountAmount: l.discountAmount || '0',
        taxRate: l.taxRate || '0'
      }))
    };

    try {
      const res = await fetchApi<{ estimate: any }>(`/api/v1/estimates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setEstimate(res.estimate);
      initFormState(res.estimate);
      setIsEditing(false);
      setSuccessMessage('Estimate updated successfully');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      if (err.statusCode === 409 || err.code === 'CONFLICT' || err.message?.includes('modified')) {
        setConflictError(err.message || 'Estimate was modified concurrently. Please reload to see the latest version.');
      } else {
        setValidationError(err.message || 'Validation error saving estimate');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16">
        <Spinner />
        <p className="text-gray-500 mt-3 text-sm">Loading estimate draft...</p>
      </div>
    );
  }

  if (error) {
    const isForbidden = errorStatus === 403 || error.toLowerCase().includes('permission') || error.toLowerCase().includes('forbidden');
    const isNotFound = errorStatus === 404 || error.toLowerCase().includes('not found');

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className={`p-8 border-l-4 ${isForbidden ? 'border-amber-500 bg-amber-50' : isNotFound ? 'border-blue-500 bg-blue-50' : 'border-red-500 bg-red-50'}`}>
          <h2 className="text-xl font-bold mb-2">
            {isForbidden ? '🔒 Access Denied' : isNotFound ? '🔍 Estimate Not Found' : '⚠️ Error Loading Estimate'}
          </h2>
          <p className="text-gray-700 text-sm mb-4">{error}</p>
          <div className="flex gap-3">
            <Link href="/estimates">
              <Button variant="secondary">Back to Estimates</Button>
            </Link>
            {!isForbidden && !isNotFound && (
              <Button onClick={loadEstimate}>Try Again</Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (!estimate) return <div className="p-6 text-gray-500 text-center">Estimate not found</div>;

  const isConverted = estimate.status === 'CONVERTED';
  const canEdit = !isConverted;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Return Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/estimates" className="hover:text-blue-600 transition-colors">
            Estimates
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold font-mono">{estimate.estimateNumber}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/estimates">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs font-medium flex items-center gap-1.5">
              <span>←</span> All Estimates
            </Button>
          </Link>
          <Link href="/parcha/new">
            <Button variant="secondary" className="text-xs px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 shadow-2xs font-semibold flex items-center gap-1.5">
              <span>📸</span> New Parcha
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs font-semibold flex items-center gap-1.5">
              <span>🏠</span> Dashboard
            </Button>
          </Link>
        </div>
      </div>


      {/* Top Header & Lifecycle Controls */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Estimate {estimate.estimateNumber}</h1>
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
              estimate.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' :
              estimate.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
              estimate.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
              estimate.status === 'CONVERTED' ? 'bg-purple-100 text-purple-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {estimate.status}
            </span>
            <span className="text-xs text-gray-400">v{estimate.version ?? 0}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Created: {estimate.createdAt ? new Date(estimate.createdAt).toLocaleString() : 'N/A'} • Last Updated: {estimate.updatedAt ? new Date(estimate.updatedAt).toLocaleString() : 'N/A'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Link href="/">
            <Button variant="secondary" className="text-sm font-semibold flex items-center gap-1 bg-white hover:bg-gray-100 border-gray-300">
              <span>🏠</span> Home
            </Button>
          </Link>
          <Link href={`/estimates/${estimate.id}/print`} target="_blank" rel="noreferrer">
            <Button variant="secondary" className="text-sm">🖨️ Print / PDF</Button>
          </Link>

          {!isEditing && canEdit && (
            <Button onClick={() => setIsEditing(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
              ✏️ Edit Draft
            </Button>
          )}

          {/* Status Transitions */}
          {!isEditing && estimate.status === 'DRAFT' && (
            <Button variant="secondary" onClick={() => handleStatus('SENT')} className="text-sm">
              Mark as Sent
            </Button>
          )}
          {!isEditing && estimate.status === 'SENT' && (
            <>
              <Button variant="secondary" onClick={() => handleStatus('ACCEPTED')} className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 text-sm">
                Accept
              </Button>
              <Button variant="secondary" onClick={() => handleStatus('REJECTED')} className="text-red-600 text-sm">
                Reject
              </Button>
            </>
          )}
          {!isEditing && estimate.status === 'ACCEPTED' && (
            <Button onClick={handleOpenConvertModal} className="bg-green-600 hover:bg-green-700 text-white text-sm">
              Convert to Bill
            </Button>
          )}
        </div>
      </div>

      {/* Notifications and Alerts */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800 flex justify-between items-center">
          <span>✅ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 font-bold">×</button>
        </div>
      )}

      {conflictError && (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-md text-sm text-amber-900 flex justify-between items-center">
          <div>
            <strong className="block font-semibold">⚠️ Concurrency Conflict (Lost Update Prevention)</strong>
            <span>{conflictError}</span>
          </div>
          <Button onClick={loadEstimate} className="bg-amber-600 hover:bg-amber-700 text-white text-xs ml-4">
            Reload Latest
          </Button>
        </div>
      )}

      {validationError && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md text-sm text-red-900 flex justify-between items-center">
          <div>
            <strong className="block font-semibold">Validation Error</strong>
            <span>{validationError}</span>
          </div>
          <button onClick={() => setValidationError(null)} className="text-red-600 font-bold ml-4">×</button>
        </div>
      )}

      {/* Edit Mode Banner */}
      {isEditing && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
            <span className="text-sm font-semibold text-indigo-900">Editing Persisted Estimate Draft</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Unsaved Local Edits</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCancelEdit} disabled={isSaving} className="text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Main Details Card */}
      <Card className="p-6 space-y-6">
        {/* Top Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-gray-200">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Customer
            </label>
            {isEditing ? (
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- Cash / Walk-in Customer --</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phoneNumber})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-medium text-gray-900">
                {estimate.customer?.name || <span className="text-gray-400 italic">Cash / Unregistered</span>}
                {estimate.customer?.phoneNumber && (
                  <span className="block text-xs text-gray-500">{estimate.customer.phoneNumber}</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Issue & Validity Dates
            </label>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-400 block">Issue Date</span>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Valid Until</span>
                  <input
                    type="date"
                    value={validityDate}
                    onChange={e => setValidityDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-900">
                <div>Issue: {new Date(estimate.issueDate).toLocaleDateString()}</div>
                {estimate.validityDate && (
                  <div className="text-xs text-gray-500">Valid Until: {new Date(estimate.validityDate).toLocaleDateString()}</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Source Parcha Slip
            </label>
            {estimate.parchaJobId ? (
              <div className="text-sm">
                <Link
                  href={`/parcha/${estimate.parchaJobId}`}
                  className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
                >
                  <span>📋 {estimate.parchaJob?.originalFilename || 'Source Parcha Job'}</span>
                </Link>
                <span className="block text-xs text-gray-400">ID: {estimate.parchaJobId.substring(0, 8)}...</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">Direct manual estimate (no parcha)</span>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800 text-sm tracking-wide uppercase">
              Line Items ({isEditing ? editableLines.length : estimate.lines?.length || 0})
            </h3>
            {isEditing && (
              <Button variant="secondary" onClick={handleAddLine} className="text-xs">
                + Add Manual Line
              </Button>
            )}
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                <tr>
                  <th className="text-left py-2.5 px-3">Item Details</th>
                  <th className="text-right py-2.5 px-3 w-24">Qty</th>
                  <th className="text-center py-2.5 px-3 w-16">Unit</th>
                  <th className="text-right py-2.5 px-3 w-28">Rate (₹)</th>
                  <th className="text-right py-2.5 px-3 w-24">Disc (₹)</th>
                  <th className="text-right py-2.5 px-3 w-20">Tax (%)</th>
                  <th className="text-right py-2.5 px-3 w-32">Total (₹)</th>
                  {isEditing && <th className="text-center py-2.5 px-3 w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {isEditing ? (
                  editableLines.map((line, idx) => {
                    const preview = calculatePreviewLine(line);
                    const isParchaConfirmed = Boolean(line.parchaRowId);

                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2 px-3">
                          {isParchaConfirmed ? (
                            <div>
                              <div className="font-medium text-gray-900 flex items-center gap-1.5">
                                <span>🔒 {line.productSnapshot}</span>
                                <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                  Parcha Confirmed
                                </span>
                              </div>
                              {line.variantSnapshot && (
                                <div className="text-xs text-gray-500 font-mono">{line.variantSnapshot}</div>
                              )}
                              <span className="text-[10px] text-gray-400">Product & variant locked to preserve OCR match</span>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="text"
                                value={line.productSnapshot}
                                onChange={e => handleLineChange(idx, 'productSnapshot', e.target.value)}
                                placeholder="Product description"
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="text"
                            value={line.quantity}
                            onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                            className="w-full text-right border border-gray-300 rounded px-1.5 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="text"
                            value={line.unitOfMeasure}
                            onChange={e => handleLineChange(idx, 'unitOfMeasure', e.target.value)}
                            className="w-full text-center border border-gray-300 rounded px-1 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="text"
                            value={line.unitRate}
                            onChange={e => handleLineChange(idx, 'unitRate', e.target.value)}
                            className="w-full text-right border border-gray-300 rounded px-1.5 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="text"
                            value={line.discountAmount}
                            onChange={e => handleLineChange(idx, 'discountAmount', e.target.value)}
                            className="w-full text-right border border-gray-300 rounded px-1.5 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="text"
                            value={line.taxRate}
                            onChange={e => handleLineChange(idx, 'taxRate', e.target.value)}
                            className="w-full text-right border border-gray-300 rounded px-1.5 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900 font-mono">
                          ₹{preview.lineAmount}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-red-500 hover:text-red-700 font-bold text-sm"
                            title="Remove line"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  (estimate.lines || []).map((line: any) => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-900 flex items-center gap-1.5">
                          <span>{line.productSnapshot}</span>
                          {line.parchaRowId && (
                            <span className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-semibold border border-purple-200">
                              OCR Parcha
                            </span>
                          )}
                        </div>
                        {line.variantSnapshot && (
                          <div className="text-xs text-gray-500 font-mono">{line.variantSnapshot}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{line.quantity}</td>
                      <td className="py-2.5 px-3 text-center text-gray-500">{line.unitOfMeasure || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-mono">₹{line.unitRate}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-500">₹{line.discountAmount}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-500">{line.taxRate}%</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-900 font-mono">
                        ₹{line.lineAmount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes, Terms & Document Totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Notes
              </label>
              {isEditing ? (
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="Notes for customer"
                />
              ) : (
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{estimate.notes || <span className="text-gray-400 italic">None</span>}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Terms & Conditions
              </label>
              {isEditing ? (
                <textarea
                  value={terms}
                  onChange={e => setTerms(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="Terms and conditions"
                />
              ) : (
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{estimate.terms || <span className="text-gray-400 italic">None</span>}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-2 bg-gray-50 p-4 rounded-md border border-gray-200">
              {isEditing && (
                <div className="text-[10px] uppercase font-bold text-indigo-600 pb-1 border-b border-gray-200 tracking-wider">
                  Live Preview (Ceiling Rounding)
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-600">
                <span>Subtotal:</span>
                <span className="font-mono">₹{isEditing ? previewTotals.subtotal : estimate.subtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Discount Total:</span>
                <span className="font-mono">₹{isEditing ? previewTotals.discountTotal : estimate.discountTotal}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Tax Total:</span>
                <span className="font-mono">₹{isEditing ? previewTotals.taxTotal.toFixed(2) : estimate.taxTotal}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
                <span>Grand Total:</span>
                <span className="font-mono">₹{isEditing ? previewTotals.grandTotal : estimate.grandTotal}</span>
              </div>
              {isEditing && (
                <p className="text-[10px] text-gray-400 text-right mt-1">
                  Server calculation is authoritative upon save
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Convert to Bill Confirmation Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Convert to Bill</h3>
                <p className="text-xs text-gray-500">Transform estimate into a formal invoice</p>
              </div>
              <button
                disabled={isConverting}
                onClick={() => { setShowConvertModal(false); setConvertError(null); }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {convertError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                {convertError}
              </div>
            )}

            <div className="bg-gray-50 rounded p-4 space-y-2 text-sm border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">Estimate Number:</span>
                <span className="font-semibold text-gray-900">{estimate.estimateNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Customer:</span>
                <span className="font-medium text-gray-900">
                  {estimate.customer?.name || (customers.find(c => c.id === estimate.customerId)?.name) || 'Walk-in / Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Line Items:</span>
                <span className="font-medium text-gray-900">{estimate.lines?.length || 0}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-900">
                <span>Grand Total:</span>
                <span className="font-mono text-base text-green-700">₹{estimate.grandTotal}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded text-xs text-amber-800">
              <strong className="block font-semibold mb-1">Important:</strong>
              Converting this estimate will immediately generate a new Bill (Invoice) and transition this estimate to <strong>CONVERTED</strong>. Once converted, the estimate is locked and can no longer be edited.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={isConverting}
                onClick={() => { setShowConvertModal(false); setConvertError(null); }}
              >
                Cancel
              </Button>
              <Button
                disabled={isConverting}
                onClick={handleConfirmConvert}
                className="bg-green-600 hover:bg-green-700 text-white font-medium"
              >
                {isConverting ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Converting...
                  </span>
                ) : (
                  'Confirm & Convert to Bill'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
