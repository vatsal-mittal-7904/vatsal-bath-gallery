/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { DocumentPrintView, DocumentData } from '@/components/ui/DocumentPrintView';

export default function BillPrintPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<DocumentData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi<{ bill: any }>(`/api/v1/bills/${params.id}`)
      .then(res => {
        const b = res.bill;
        setData({
          type: 'BILL',
          documentNumber: b.billNumber,
          issueDate: b.issueDate,
          status: b.status,
          customer: b.customer,
          lines: b.lines,
          subtotal: b.subtotal,
          discountTotal: b.discountTotal,
          taxTotal: b.taxTotal,
          grandTotal: b.grandTotal,
          amountPaid: b.amountPaid,
          balanceDue: b.balanceDue,
          notes: b.notes,
          terms: b.terms
        });
        // Auto trigger print dialog after a brief delay so styles load
        setTimeout(() => window.print(), 500);
      })
      .catch(err => setError(err.message));
  }, [params.id]);

  if (error) return <div className="p-10 text-red-500 font-bold">Error loading bill: {error}</div>;
  if (!data) return <div className="flex justify-center p-20"><Spinner /></div>;

  return <DocumentPrintView data={data} />;
}
