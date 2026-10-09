/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const canViewProfit = hasPermission(user?.role, 'reports:profit:read');

  const [bill, setBill] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Payment Form State
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [paying, setPaying] = useState(false);

  const loadBill = () => {
    fetchApi<{ bill: any }>(`/api/v1/bills/${id}`)
      .then(res => {
        setBill(res.bill);
        if (res.bill?.locationId) {
          setSelectedLocationId(res.bill.locationId);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
      
    fetchApi<{ payments: any[] }>(`/api/v1/bills/${id}/payments`)
      .then(res => setPayments(res.payments))
      .catch(console.error);

    fetchApi<{ items: any[] }>(`/api/v1/inventory/locations?isActive=true`)
      .then(res => {
        if (res.items) setLocations(res.items);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadBill();
  }, [id]);

  const handleIssueBill = async () => {
    setActionError(null);
    setIssuing(true);
    try {
      await fetchApi(`/api/v1/bills/${id}/status`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          status: 'ISSUED',
          locationId: selectedLocationId || bill.locationId || undefined
        })
      });
      loadBill();
    } catch (err: any) {
      setActionError(err.message || 'Failed to issue bill');
    } finally {
      setIssuing(false);
    }
  };

  const handleCancelBill = async () => {
    const isIssued = bill.status === 'ISSUED';
    const confirmMessage = isIssued
      ? 'Are you sure you want to cancel this bill? This will automatically restore all deducted stock to inventory.'
      : 'Are you sure you want to cancel this draft bill?';

    if (!confirm(confirmMessage)) return;

    setActionError(null);
    setCancelling(true);
    try {
      await fetchApi(`/api/v1/bills/${id}/status`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      loadBill();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel bill');
    } finally {
      setCancelling(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) return;

    setPaying(true);
    try {
      await fetchApi(`/api/v1/bills/${id}/payments`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          amount: parseFloat(payAmount),
          paymentMethod: payMethod,
          paymentDate: new Date().toISOString(),
          transactionRef: payRef || undefined
        })
      });
      setPayAmount('');
      setPayRef('');
      loadBill(); // refresh bill and payments
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-xs text-slate-500">
        Bill not found.
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'ISSUED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'PARTIALLY_PAID':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DRAFT':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Return Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/bills" className="hover:text-blue-600 transition-colors">
            Bills
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold font-mono">{bill.billNumber}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs font-semibold flex items-center gap-1.5">
              <span>🏠</span> Homepage
            </Button>
          </Link>
          <Link href="/bills">
            <Button variant="secondary" className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs flex items-center gap-1.5">
              <span>←</span> All Bills
            </Button>
          </Link>
          <Link href="/parcha/new">
            <Button variant="secondary" className="text-xs px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 shadow-2xs font-semibold flex items-center gap-1.5">
              <span>📸</span> New Parcha
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Grid: Left Column Bill Details, Right Column Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
                  Bill {bill.billNumber}
                </h1>
                <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(bill.status)}`}>
                  {bill.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Issued: {new Date(bill.issueDate).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a href={`/bills/${bill.id}/print`} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="text-xs px-3 py-2 bg-white hover:bg-slate-50 border-slate-200">
                  🖨️ Print / PDF
                </Button>
              </a>
              {bill.status === 'DRAFT' && (
                <Button onClick={handleIssueBill} disabled={issuing} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2">
                  {issuing ? 'Issuing...' : '✓ Issue Bill'}
                </Button>
              )}
              {bill.status !== 'CANCELLED' && parseFloat(bill.amountPaid || '0') === 0 && (
                <Button variant="secondary" onClick={handleCancelBill} disabled={cancelling} className="text-xs px-3 py-2 text-red-600 hover:text-red-700 border-red-200">
                  {cancelling ? 'Cancelling...' : 'Cancel Bill'}
                </Button>
              )}
            </div>
          </div>

          {actionError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex justify-between items-center">
              <div>
                <p className="font-semibold">Action Failed</p>
                <p>{actionError}</p>
              </div>
              <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-800 text-xs font-bold uppercase ml-4">
                Dismiss
              </button>
            </div>
          )}

          {/* Customer & Location Metadata Card */}
          <Card className="p-5 space-y-4 border border-slate-200/90 shadow-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Customer</span>
                <span className="text-sm font-semibold text-slate-900">{bill.customer?.name || 'Walk-in'}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Issue Date</span>
                <span className="text-sm font-medium text-slate-800">{new Date(bill.issueDate).toLocaleDateString()}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Inventory Location</span>
                {bill.status === 'DRAFT' ? (
                  <select
                    className="mt-1 block w-full text-xs border-slate-300 rounded-md shadow-2xs border p-1.5 bg-white text-slate-800"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                  >
                    <option value="">Default Location</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-medium text-slate-800">
                    {bill.location ? `${bill.location.name} (${bill.location.code})` : 'Default Location'}
                  </span>
                )}
              </div>
              {bill.estimate && (
                <div className="sm:col-span-4 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Source Quotation:</span>
                  <Link href={`/estimates/${bill.estimate.id}`} className="text-indigo-600 hover:underline font-semibold text-xs inline-flex items-center gap-1.5">
                    <span>📄 {bill.estimate.estimateNumber}</span>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-semibold uppercase">Converted</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Owner Profit & Margin Breakdown Box */}
            {canViewProfit && bill.profit && (
              <div className="p-4 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white border border-emerald-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📈</span>
                    <h4 className="font-bold text-emerald-950 text-xs uppercase tracking-wider">
                      Owner Profit & Margin Breakdown
                    </h4>
                  </div>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    Confidential
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="text-[11px] text-slate-500 block">Revenue (excl. Tax)</span>
                    <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                      ₹{parseFloat(bill.profit.totalRevenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="text-[11px] text-slate-500 block">Wholesale Cost (COGS)</span>
                    <span className="text-sm font-bold text-slate-700 font-mono tabular-nums">
                      ₹{parseFloat(bill.profit.totalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="text-[11px] text-slate-500 block">Gross Profit</span>
                    <span className="text-sm font-bold text-emerald-600 font-mono tabular-nums">
                      ₹{parseFloat(bill.profit.grossProfit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="text-[11px] text-slate-500 block">Profit Margin</span>
                    <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                      {bill.profit.marginPercentage}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Line Items Table */}
            <div className="pt-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Line Items
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-semibold">Item & Variant</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Qty</th>
                      <th className="text-right py-2.5 px-3 font-semibold">Selling Rate</th>
                      {canViewProfit && bill.profit && (
                        <>
                          <th className="text-right py-2.5 px-3 font-semibold text-emerald-800">Unit Cost</th>
                          <th className="text-right py-2.5 px-3 font-semibold text-emerald-800">Total Cost</th>
                        </>
                      )}
                      <th className="text-right py-2.5 px-3 font-semibold">Amount</th>
                      {canViewProfit && bill.profit && (
                        <th className="text-right py-2.5 px-3 font-semibold text-emerald-800">Profit</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bill.lines.map((line: any) => (
                      <tr key={line.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{line.productSnapshot}</div>
                          <div className="text-[11px] text-slate-400">{line.variantSnapshot}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{line.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">₹{line.unitRate}</td>
                        {canViewProfit && bill.profit && (
                          <>
                            <td className="py-2.5 px-3 text-right text-slate-600 font-mono tabular-nums">
                              ₹{line.profit?.unitCost || '0.00'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600 font-mono tabular-nums">
                              ₹{line.profit?.totalCost || '0.00'}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono tabular-nums">
                          ₹{line.lineAmount}
                        </td>
                        {canViewProfit && bill.profit && (
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 font-mono tabular-nums">
                            ₹{line.profit?.grossProfit || '0.00'}
                            <span className="block text-[10px] text-emerald-600 font-normal">
                              {line.profit?.marginPercentage || '0.00'}%
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subtotal, Tax, Grand Total */}
            <div className="flex justify-end pt-3">
              <div className="w-64 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span className="font-mono tabular-nums">₹{bill.subtotal}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax Total:</span>
                  <span className="font-mono tabular-nums">₹{bill.taxTotal}</span>
                </div>
                <div className="flex justify-between font-extrabold text-base text-slate-900 border-t border-slate-200 pt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono tabular-nums text-blue-600">₹{bill.grandTotal}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Payments & Settle status */}
        <div className="space-y-6">
          <Card className="p-5 bg-gradient-to-br from-blue-50/70 to-slate-50 border border-blue-200/80 shadow-xs">
            <h2 className="text-xs font-bold text-blue-950 uppercase tracking-wider mb-3">
              Payment Summary
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Amount:</span>
                <span className="font-bold font-mono tabular-nums text-slate-900">₹{bill.grandTotal}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Amount Paid:</span>
                <span className="font-bold font-mono tabular-nums">₹{bill.amountPaid}</span>
              </div>
              <div className="flex justify-between font-extrabold text-base pt-3 border-t border-blue-200 text-slate-900">
                <span>Balance Due:</span>
                <span className={`font-mono tabular-nums ${parseFloat(bill.balanceDue) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ₹{bill.balanceDue}
                </span>
              </div>
            </div>
          </Card>

          {bill.status === 'PAID' && (
            <Card className="p-5 bg-gradient-to-br from-emerald-50 to-green-50/80 border-2 border-emerald-300 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-xs">
                ✓
              </div>
              <div>
                <h3 className="font-bold text-emerald-950 text-base">Bill Fully Settled</h3>
                <p className="text-xs text-emerald-700 mt-0.5">Payment completed and stock deducted from inventory.</p>
              </div>
              <div className="pt-2 space-y-2">
                <Link href="/" className="block w-full">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 shadow-xs flex items-center justify-center gap-2 text-xs">
                    <span>🏠</span> Return to Main Homepage
                  </Button>
                </Link>
                <Link href="/bills" className="block w-full">
                  <Button variant="secondary" className="w-full bg-white hover:bg-slate-50 border-slate-300 font-semibold py-2 flex items-center justify-center gap-2 text-xs">
                    <span>📋</span> View All Bills
                  </Button>
                </Link>
                <Link href="/parcha/new" className="block w-full">
                  <Button variant="secondary" className="w-full bg-white hover:bg-blue-50 text-blue-700 border-blue-200 font-semibold py-2 flex items-center justify-center gap-2 text-xs">
                    <span>📸</span> Start Next Parcha
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {bill.status === 'DRAFT' && (
            <Card className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl">
              <p className="font-bold mb-1">Draft Bill</p>
              <p>Please issue this bill to deduct inventory before recording customer payments.</p>
            </Card>
          )}

          {parseFloat(bill.balanceDue) > 0 && bill.status !== 'CANCELLED' && bill.status !== 'DRAFT' && (
            <Card className="p-5 border border-slate-200/90 shadow-xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Record Payment</h3>
              <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payment Amount (₹)</label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    max={bill.balanceDue}
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder={`Max ₹${bill.balanceDue}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Method</label>
                  <select
                    className="w-full border border-slate-300 p-2 rounded-lg text-xs bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Ref (Optional)</label>
                  <Input
                    value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                    placeholder="e.g. UPI Ref / UTR / Cheque #"
                  />
                </div>
                <Button type="submit" disabled={paying || !payAmount} className="w-full text-xs py-2 bg-blue-600 hover:bg-blue-700 text-white">
                  {paying ? 'Recording...' : 'Record Payment'}
                </Button>
              </form>
            </Card>
          )}

          {/* Payment History */}
          <Card className="p-5 border border-slate-200/90 shadow-xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Payment Receipts</h3>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-400">No payment receipts recorded yet.</p>
            ) : (
              <ul className="space-y-2.5 divide-y divide-slate-100">
                {payments.map((p: any) => (
                  <li key={p.id} className="pt-2.5 first:pt-0 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-800">{p.paymentMethod}</span>
                      <span className="text-emerald-600 font-mono tabular-nums">₹{parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      {new Date(p.paymentDate).toLocaleDateString()} {p.transactionRef && `• Ref: ${p.transactionRef}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Bottom Footer Navigation Bar */}
      <div className="pt-6 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
        <Link href="/bills">
          <Button variant="secondary" className="flex items-center gap-1.5 font-medium bg-white hover:bg-slate-50 border-slate-200 text-xs">
            <span>←</span> Back to All Bills
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/parcha/new">
            <Button variant="secondary" className="flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-semibold text-xs">
              <span>📸</span> New Parcha
            </Button>
          </Link>
          <Link href="/">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-xs text-xs">
              <span>🏠</span> Return to Main Homepage
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
