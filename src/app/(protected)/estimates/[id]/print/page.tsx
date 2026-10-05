/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { use, useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { DocumentPrintView, DocumentData } from '@/components/ui/DocumentPrintView';

export default function EstimatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DocumentData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi<{ estimate: any }>(`/api/v1/estimates/${id}`)
      .then(res => {
        const e = res.estimate;
        setData({
          type: 'ESTIMATE',
          documentNumber: e.estimateNumber,
          issueDate: e.issueDate,
          validityDate: e.validityDate,
          status: e.status,
          customer: e.customer,
          lines: e.lines,
          subtotal: e.subtotal,
          discountTotal: e.discountTotal,
          taxTotal: e.taxTotal,
          grandTotal: e.grandTotal,
          notes: e.notes,
          terms: e.terms
        });
        setTimeout(() => window.print(), 500);
      })
      .catch(err => setError(err.message));
  }, [id]);

  if (error) return <div className="p-10 text-red-500 font-bold">Error loading estimate: {error}</div>;
  if (!data) return <div className="flex justify-center p-20"><Spinner /></div>;

  return <DocumentPrintView data={data} />;
}
