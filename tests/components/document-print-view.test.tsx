/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DocumentPrintView, DocumentData } from '../../src/components/ui/DocumentPrintView';

describe('DocumentPrintView Component', () => {
  const mockEstimate: DocumentData = {
    type: 'ESTIMATE',
    documentNumber: 'EST-001',
    issueDate: '2026-10-01T00:00:00Z',
    status: 'DRAFT',
    customer: {
      name: 'Test Customer',
      phoneNumber: '9876543210',
    },
    lines: [
      {
        id: '1',
        productSnapshot: 'Test Pipe',
        variantSnapshot: '1 inch',
        quantity: '5',
        unitRate: '100',
        lineAmount: '500',
      }
    ],
    subtotal: '500',
    discountTotal: '0',
    taxTotal: '90',
    grandTotal: '590'
  };

  it('renders estimate details correctly', () => {
    render(<DocumentPrintView data={mockEstimate} />);
    
    expect(screen.getByText('ESTIMATE')).not.toBeNull();
    expect(screen.getByText('EST-001')).not.toBeNull();
    expect(screen.getByText('Test Customer')).not.toBeNull();
    expect(screen.getByText('Test Pipe')).not.toBeNull();
    expect(screen.getByText('₹590.00')).not.toBeNull(); // formatted
  });

  it('renders bill with payment details correctly', () => {
    const mockBill: DocumentData = {
      ...mockEstimate,
      type: 'BILL',
      documentNumber: 'INV-001',
      amountPaid: '500',
      balanceDue: '90',
    };
    
    render(<DocumentPrintView data={mockBill} />);
    
    expect(screen.getByText('BILL')).not.toBeNull();
    expect(screen.getByText('INV-001')).not.toBeNull();
    expect(screen.getByText('Amount Paid')).not.toBeNull();
    expect(screen.getAllByText('₹500.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Balance Due')).not.toBeNull();
    expect(screen.getAllByText('₹90.00').length).toBeGreaterThan(0);
  });
});
