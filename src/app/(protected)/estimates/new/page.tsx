/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function EstimateForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    fetchApi<{ items: any[] }>('/api/v1/customers').then(res => setCustomers(res.items));
    fetchApi<{ items: any[] }>('/api/v1/catalogue/products').then(res => setProducts(res.items));
  }, []);

  const handleAddLine = () => {
    setLines([...lines, { 
      productId: '', 
      variantId: '', 
      quantity: '1', 
      unitRate: '0', 
      discountAmount: '0', 
      taxRate: '0' 
    }]);
  };

  const handleLineChange = (index: number, field: string, value: string) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    
    // Auto-fill price if variant selected
    if (field === 'variantId' && value) {
      const product = products.find(p => p.id === newLines[index].productId);
      const variant = product?.variants?.find((v: any) => v.id === value);
      if (variant) {
        newLines[index].unitRate = variant.price.toString();
        newLines[index].productSnapshot = product.name;
        newLines[index].variantSnapshot = variant.name;
      }
    }
    
    setLines(newLines);
  };

  const calculateLineTotal = (line: any) => {
    const qty = parseFloat(line.quantity) || 0;
    const rate = parseFloat(line.unitRate) || 0;
    const subtotal = Math.ceil(qty * rate); // Ceiling rounding!
    const discount = parseFloat(line.discountAmount) || 0;
    const taxRate = parseFloat(line.taxRate) || 0;
    
    const taxable = subtotal - discount;
    const tax = taxable * (taxRate / 100);
    return Math.ceil(taxable + tax);
  };

  const calculateGrandTotal = () => {
    return lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const payload = {
      customerId,
      issueDate: new Date(issueDate || '').toISOString(),
      validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      notes,
      termsAndConditions: terms,
      lines: lines.map(l => ({
        productId: l.productId,
        variantId: l.variantId,
        productSnapshot: l.productSnapshot || 'Unknown',
        variantSnapshot: l.variantSnapshot || 'Unknown',
        quantity: l.quantity,
        unitRate: l.unitRate,
        discountAmount: l.discountAmount,
        taxRate: l.taxRate
      }))
    };

    try {
      await fetchApi('/api/v1/estimates', { 
        method: 'POST', 
        body: JSON.stringify(payload),
        headers: { 'idempotency-key': crypto.randomUUID() }
      });
      router.push('/estimates');
    } catch (err: any) {
      setError(err.message || 'Failed to save estimate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">New Estimate</h1>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Customer</label>
              <select required className="w-full border p-2 rounded" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Issue Date</label>
              <Input type="date" required value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <h3 className="font-semibold">Line Items</h3>
              <Button type="button" variant="secondary" onClick={handleAddLine}>Add Line</Button>
            </div>
            
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Product</th>
                  <th className="text-left py-2">Variant</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Rate</th>
                  <th className="text-right py-2">Disc</th>
                  <th className="text-right py-2">Tax %</th>
                  <th className="text-right py-2">Amount (Rounded)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const product = products.find(p => p.id === line.productId);
                  return (
                    <tr key={i} className="border-b">
                      <td className="py-2">
                        <select className="w-full border p-1" value={line.productId} onChange={e => handleLineChange(i, 'productId', e.target.value)}>
                          <option value="">Select...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2">
                        <select className="w-full border p-1" value={line.variantId} onChange={e => handleLineChange(i, 'variantId', e.target.value)}>
                          <option value="">Select...</option>
                          {product?.variants?.map((v:any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2"><Input type="number" step="1" className="w-20 text-right" value={line.quantity} onChange={e => handleLineChange(i, 'quantity', e.target.value)} /></td>
                      <td className="py-2"><Input type="number" step="0.01" className="w-24 text-right" value={line.unitRate} onChange={e => handleLineChange(i, 'unitRate', e.target.value)} /></td>
                      <td className="py-2"><Input type="number" step="0.01" className="w-20 text-right" value={line.discountAmount} onChange={e => handleLineChange(i, 'discountAmount', e.target.value)} /></td>
                      <td className="py-2"><Input type="number" step="0.1" className="w-20 text-right" value={line.taxRate} onChange={e => handleLineChange(i, 'taxRate', e.target.value)} /></td>
                      <td className="py-2 text-right font-medium">₹{calculateLineTotal(line)}</td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>X</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            <div className="flex justify-end mt-4 text-lg font-bold">
              Grand Total: ₹{calculateGrandTotal()}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading || lines.length === 0}>Save Estimate</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
