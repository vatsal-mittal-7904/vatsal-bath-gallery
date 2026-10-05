import React from 'react';
import { APP_NAME } from '@/lib/config/constants';

export type DocumentData = {
  type: 'ESTIMATE' | 'BILL';
  documentNumber: string;
  issueDate: string;
  validityDate?: string;
  status: string;
  customer?: {
    name: string;
    phoneNumber: string;
    billingAddress?: string;
    email?: string;
    gstin?: string;
  };
  lines: Array<{
    id: string;
    productSnapshot: string;
    variantSnapshot: string;
    sku?: string;
    quantity: string | number;
    unitRate: string;
    lineAmount: string; // The strictly rounded final amount
  }>;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountPaid?: string;
  balanceDue?: string;
  notes?: string;
  terms?: string;
};

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(new Date(dateString));
};

const formatCurrency = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

export const DocumentPrintView = ({ data }: { data: DocumentData }) => {
  return (
    <div className="bg-white text-black text-sm max-w-4xl mx-auto" style={{ fontFamily: 'sans-serif' }}>
      
      {/* Action Bar - Hidden in print */}
      <div className="print:hidden flex justify-end p-4 mb-4 bg-gray-100 rounded-b shadow-sm">
        <button 
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow font-medium"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="p-8 print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-800">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight uppercase">{data.type}</h1>
            <p className="text-gray-600 mt-1 font-medium">{data.documentNumber}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">{APP_NAME}</h2>
            {/* Using placeholder text since we are told not to invent address, but we can print APP_NAME */}
          </div>
        </div>

        {/* Meta Info */}
        <div className="flex justify-between mb-8">
          <div className="w-1/2 pr-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Billed To</h3>
            {data.customer ? (
              <div className="text-gray-900 leading-relaxed">
                <p className="font-bold text-base">{data.customer.name}</p>
                <p>{data.customer.phoneNumber}</p>
                {data.customer.email && <p>{data.customer.email}</p>}
                {data.customer.billingAddress && <p className="whitespace-pre-wrap mt-1">{data.customer.billingAddress}</p>}
                {data.customer.gstin && <p className="mt-1 font-medium">GSTIN: {data.customer.gstin}</p>}
              </div>
            ) : (
              <p className="text-gray-500 italic">No customer selected</p>
            )}
          </div>
          
          <div className="w-1/3">
            <table className="w-full text-right">
              <tbody>
                <tr>
                  <td className="font-semibold text-gray-600 py-1">Issue Date:</td>
                  <td className="text-gray-900 py-1">{formatDate(data.issueDate)}</td>
                </tr>
                {data.validityDate && (
                  <tr>
                    <td className="font-semibold text-gray-600 py-1">Valid Until:</td>
                    <td className="text-gray-900 py-1">{formatDate(data.validityDate)}</td>
                  </tr>
                )}
                <tr>
                  <td className="font-semibold text-gray-600 py-1">Status:</td>
                  <td className="text-gray-900 py-1 font-bold">{data.status}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Lines Table */}
        <table className="w-full mb-8 border-collapse">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              <th className="py-3 px-2 text-left text-xs font-bold text-gray-700 uppercase">Item Description</th>
              <th className="py-3 px-2 text-right text-xs font-bold text-gray-700 uppercase w-20">Qty</th>
              <th className="py-3 px-2 text-right text-xs font-bold text-gray-700 uppercase w-28">Rate</th>
              <th className="py-3 px-2 text-right text-xs font-bold text-gray-700 uppercase w-32">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.lines.map((line, index) => (
              <tr key={line.id || index} className="break-inside-avoid">
                <td className="py-3 px-2">
                  <p className="font-bold text-gray-900">{line.productSnapshot}</p>
                  {(line.variantSnapshot || line.sku) && (
                    <p className="text-sm text-gray-600">
                      {line.variantSnapshot} {line.sku ? ` (SKU: ${line.sku})` : ''}
                    </p>
                  )}
                </td>
                <td className="py-3 px-2 text-right text-gray-900">{line.quantity}</td>
                <td className="py-3 px-2 text-right text-gray-900">{formatCurrency(line.unitRate)}</td>
                <td className="py-3 px-2 text-right font-bold text-gray-900">{formatCurrency(line.lineAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Section */}
        <div className="flex justify-end mb-8 break-inside-avoid">
          <div className="w-1/2 sm:w-1/3">
            <table className="w-full text-right">
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-2 text-gray-600">Subtotal</td>
                  <td className="py-2 text-gray-900 font-medium">{formatCurrency(data.subtotal)}</td>
                </tr>
                {parseFloat(data.discountTotal) > 0 && (
                  <tr>
                    <td className="py-2 text-gray-600">Discount</td>
                    <td className="py-2 text-red-600 font-medium">-{formatCurrency(data.discountTotal)}</td>
                  </tr>
                )}
                {parseFloat(data.taxTotal) > 0 && (
                  <tr>
                    <td className="py-2 text-gray-600">Tax</td>
                    <td className="py-2 text-gray-900 font-medium">{formatCurrency(data.taxTotal)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-800">
                  <td className="py-3 font-bold text-lg text-gray-900">Total</td>
                  <td className="py-3 font-bold text-lg text-gray-900">{formatCurrency(data.grandTotal)}</td>
                </tr>
                
                {data.type === 'BILL' && data.amountPaid !== undefined && (
                  <>
                    <tr className="border-t border-gray-200">
                      <td className="py-2 text-gray-600">Amount Paid</td>
                      <td className="py-2 text-green-700 font-medium">{formatCurrency(data.amountPaid)}</td>
                    </tr>
                    <tr className="border-t-2 border-gray-300">
                      <td className="py-2 font-bold text-gray-900">Balance Due</td>
                      <td className="py-2 font-bold text-gray-900">{formatCurrency(data.balanceDue || 0)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Notes */}
        {(data.notes || data.terms) && (
          <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-600 break-inside-avoid">
            {data.notes && (
              <div className="mb-4">
                <h4 className="font-bold text-gray-800 mb-1">Notes</h4>
                <p className="whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
            {data.terms && (
              <div>
                <h4 className="font-bold text-gray-800 mb-1">Terms and Conditions</h4>
                <p className="whitespace-pre-wrap">{data.terms}</p>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-16 text-center text-xs text-gray-400 print:fixed print:bottom-4 print:w-full">
          Generated on {formatDate(new Date().toISOString())} • {APP_NAME}
        </div>
      </div>
    </div>
  );
};
