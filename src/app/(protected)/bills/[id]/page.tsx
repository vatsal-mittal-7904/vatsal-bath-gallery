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
    setPaying(true);
    try {
      await fetchApi(`/api/v1/bills/${id}/payments`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          amount: payAmount,
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

  if (loading) return <div className="p-6"><Spinner /></div>;
  if (!bill) return <div className="p-6">Bill not found</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Quick Navigation & Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-blue-600 flex items-center gap-1.5 font-semibold text-gray-800">
            <span>🏠</span> Home
          </Link>
          <span>/</span>
          <Link href="/bills" className="hover:text-blue-600 font-medium">
            Bills
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-bold font-mono">{bill.billNumber}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="secondary" className="text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold bg-white hover:bg-gray-100 border-gray-300 shadow-xs">
              <span>🏠</span> Main Homepage
            </Button>
          </Link>
          <Link href="/bills">
            <Button variant="secondary" className="text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium bg-white hover:bg-gray-100 border-gray-300 shadow-xs">
              <span>←</span> All Bills
            </Button>
          </Link>
          <Link href="/parcha/new">
            <Button variant="secondary" className="text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 shadow-xs">
              <span>📸</span> New Parcha
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Bill {bill.billNumber}</h1>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="secondary" className="bg-white hover:bg-gray-100 border-gray-300 font-semibold flex items-center gap-1">
                  <span>🏠</span> Home
                </Button>
              </Link>
              <a href={`/bills/${bill.id}/print`} target="_blank" rel="noreferrer">
                <Button variant="secondary">🖨️ Print / PDF</Button>
              </a>
              {bill.status === 'DRAFT' && (
                <Button onClick={handleIssueBill} disabled={issuing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {issuing ? 'Issuing...' : '✓ Issue Bill'}
                </Button>
              )}
              {bill.status !== 'CANCELLED' && parseFloat(bill.amountPaid || '0') === 0 && (
                <Button variant="secondary" onClick={handleCancelBill} disabled={cancelling} className="text-red-600 hover:text-red-700">
                  {cancelling ? 'Cancelling...' : 'Cancel Bill'}
                </Button>
              )}
            </div>
          </div>

        {actionError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex justify-between items-center">
            <div>
              <p className="font-semibold">Action Failed</p>
              <p>{actionError}</p>
            </div>
            <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-800 text-xs font-bold uppercase ml-4">
              Dismiss
            </button>
          </div>
        )}
        
        <Card className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><strong className="block text-sm text-gray-500">Customer</strong> {bill.customer?.name || 'Walk-in'}</div>
            <div>
              <strong className="block text-sm text-gray-500">Status</strong>
              <span className={`px-2 py-1 rounded text-sm font-semibold ${
                bill.status === 'ISSUED' ? 'bg-blue-100 text-blue-800' :
                bill.status === 'PAID' ? 'bg-green-100 text-green-800' :
                bill.status === 'PARTIALLY_PAID' ? 'bg-amber-100 text-amber-800' :
                bill.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {bill.status}
              </span>
            </div>
            <div><strong className="block text-sm text-gray-500">Issue Date</strong> {new Date(bill.issueDate).toLocaleDateString()}</div>
            <div>
              <strong className="block text-sm text-gray-500">Inventory Location</strong>
              {bill.status === 'DRAFT' ? (
                <select
                  className="mt-1 block w-full text-sm border-gray-300 rounded-md shadow-sm border p-1"
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
                <span className="text-sm font-medium">
                  {bill.location ? `${bill.location.name} (${bill.location.code})` : 'Default Location'}
                </span>
              )}
            </div>
            {bill.estimate && (
              <div className="sm:col-span-2">
                <strong className="block text-sm text-gray-500">Source Estimate</strong>
                <Link href={`/estimates/${bill.estimate.id}`} className="text-indigo-600 hover:underline font-medium text-sm inline-flex items-center gap-1.5 mt-0.5">
                  <span>📄 {bill.estimate.estimateNumber}</span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-semibold uppercase">Converted</span>
                </Link>
              </div>
            )}
          </div>

          {canViewProfit && bill.profit && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <h4 className="font-semibold text-emerald-950 text-sm">Owner Profit & Margin Breakdown</h4>
                </div>
                <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded tracking-wide uppercase">
                  Confidential
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
                  <span className="text-xs text-gray-500 block">Revenue (excl. Tax)</span>
                  <span className="text-base font-bold text-gray-900">₹{bill.profit.totalRevenue}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
                  <span className="text-xs text-gray-500 block">Wholesale Cost (COGS)</span>
                  <span className="text-base font-bold text-gray-700">₹{bill.profit.totalCost}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
                  <span className="text-xs text-gray-500 block">Gross Profit</span>
                  <span className="text-base font-bold text-emerald-600">₹{bill.profit.grossProfit}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-xs">
                  <span className="text-xs text-gray-500 block">Profit Margin</span>
                  <span className="text-base font-bold text-emerald-700">{bill.profit.marginPercentage}%</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2 border-b pb-2">Line Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Selling Rate</th>
                  {canViewProfit && bill.profit && (
                    <>
                      <th className="text-right py-2 text-emerald-800">Unit Cost</th>
                      <th className="text-right py-2 text-emerald-800">Total Cost</th>
                    </>
                  )}
                  <th className="text-right py-2">Amount (Rounded)</th>
                  {canViewProfit && bill.profit && (
                    <th className="text-right py-2 text-emerald-800">Profit</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line: any) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{line.productSnapshot}</div>
                      <div className="text-xs text-gray-500">{line.variantSnapshot}</div>
                    </td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    <td className="py-2 text-right">₹{line.unitRate}</td>
                    {canViewProfit && bill.profit && (
                      <>
                        <td className="py-2 text-right text-gray-600 font-mono text-xs">
                          ₹{line.profit?.unitCost || '0.00'}
                        </td>
                        <td className="py-2 text-right text-gray-600 font-mono text-xs">
                          ₹{line.profit?.totalCost || '0.00'}
                        </td>
                      </>
                    )}
                    <td className="py-2 text-right font-medium">₹{line.lineAmount}</td>
                    {canViewProfit && bill.profit && (
                      <td className="py-2 text-right font-semibold text-emerald-700 font-mono text-xs">
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

          <div className="flex justify-end border-t pt-4">
            <div className="w-56 space-y-2">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal:</span> <span>₹{bill.subtotal}</span></div>
              <div className="flex justify-between text-sm text-gray-500"><span>Tax:</span> <span>₹{bill.taxTotal}</span></div>
              <div className="flex justify-between font-bold text-lg"><span>Total:</span> <span>₹{bill.grandTotal}</span></div>
              {canViewProfit && bill.profit && (
                <div className="mt-2 pt-2 border-t border-emerald-200 bg-emerald-50 p-2.5 rounded text-xs space-y-1">
                  <div className="flex justify-between text-emerald-950 font-medium">
                    <span>Total Profit:</span>
                    <span className="font-bold text-emerald-700">₹{bill.profit.grossProfit}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>Profit Margin:</span>
                    <span className="font-semibold">{bill.profit.marginPercentage}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-6 bg-blue-50 border-blue-100">
          <h2 className="text-lg font-bold mb-4">Payment Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between"><span>Total Amount</span> <span>₹{bill.grandTotal}</span></div>
            <div className="flex justify-between text-green-700"><span>Amount Paid</span> <span>₹{bill.amountPaid}</span></div>
            <div className="flex justify-between font-bold text-xl mt-4 pt-4 border-t border-blue-200">
              <span>Balance Due</span> <span>₹{bill.balanceDue}</span>
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
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 shadow-xs flex items-center justify-center gap-2">
                  <span>🏠</span> Return to Main Homepage
                </Button>
              </Link>
              <Link href="/bills" className="block w-full">
                <Button variant="secondary" className="w-full bg-white hover:bg-gray-100 border-gray-300 font-semibold py-2 flex items-center justify-center gap-2">
                  <span>📋</span> View All Bills
                </Button>
              </Link>
              <Link href="/parcha/new" className="block w-full">
                <Button variant="secondary" className="w-full bg-white hover:bg-blue-50 text-blue-700 border-blue-200 font-semibold py-2 flex items-center justify-center gap-2">
                  <span>📸</span> Start Next Parcha
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {bill.status === 'DRAFT' && (
          <Card className="p-4 bg-amber-50 border-amber-200 text-amber-800 text-sm">
            <p className="font-semibold mb-1">Draft Bill</p>
            <p>Please issue this bill to deduct inventory before recording customer payments.</p>
          </Card>
        )}

        {parseFloat(bill.balanceDue) > 0 && bill.status !== 'CANCELLED' && bill.status !== 'DRAFT' && (
          <Card className="p-6">
            <h3 className="font-bold mb-4">Record Payment</h3>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Amount</label>
                <Input required type="number" step="0.01" max={bill.balanceDue} value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Method</label>
                <select className="w-full border p-2 rounded" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Reference (Optional)</label>
                <Input value={payRef} onChange={e => setPayRef(e.target.value)} />
              </div>
              <Button type="submit" disabled={paying || !payAmount} className="w-full">Record Payment</Button>
            </form>
          </Card>
        )}

        <Card className="p-6">
          <h3 className="font-bold mb-4">Payment History</h3>
          {payments.length === 0 ? <p className="text-sm text-gray-500">No payments recorded.</p> : (
            <ul className="space-y-3">
              {payments.map((p: any) => (
                <li key={p.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex justify-between font-medium">
                    <span>{p.paymentMethod}</span>
                    <span className="text-green-600">₹{p.amount}</span>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
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
    <div className="pt-6 border-t border-gray-200 flex flex-wrap justify-between items-center gap-3">
      <Link href="/bills">
        <Button variant="secondary" className="flex items-center gap-1.5 font-medium bg-white hover:bg-gray-100 border-gray-300">
          <span>←</span> Back to All Bills
        </Button>
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/parcha/new">
          <Button variant="secondary" className="flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-semibold">
            <span>📸</span> New Parcha
          </Button>
        </Link>
        <Link href="/">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-xs">
            <span>🏠</span> Return to Main Homepage
          </Button>
        </Link>
      </div>
    </div>
  </div>
);
}
