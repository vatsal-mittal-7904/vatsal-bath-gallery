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

export default function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Bill {bill.billNumber}</h1>
          <div className="flex items-center gap-2">
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

          <div>
            <h3 className="font-semibold mb-2 border-b pb-2">Line Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Rate</th>
                  <th className="text-right py-2">Amount (Rounded)</th>
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
                    <td className="py-2 text-right font-medium">₹{line.lineAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t pt-4">
            <div className="w-48 space-y-2">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal:</span> <span>₹{bill.subtotal}</span></div>
              <div className="flex justify-between text-sm text-gray-500"><span>Tax:</span> <span>₹{bill.taxTotal}</span></div>
              <div className="flex justify-between font-bold text-lg"><span>Total:</span> <span>₹{bill.grandTotal}</span></div>
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
  );
}
