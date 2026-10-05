import { describe, it, expect } from 'vitest';
import { BillingCalculationService } from '../../src/features/billing/billing-calculation.service';

describe('Billing Calculation Service', () => {
  it('calculates line without tax and discount correctly', () => {
    const res = BillingCalculationService.calculateLine({
      quantity: '2',
      unitRate: '50.25'
    });
    expect(res.subtotal.toNumber()).toBe(101);
    expect(res.lineAmount.toNumber()).toBe(101);
  });

  it('calculates line with discount and tax', () => {
    const res = BillingCalculationService.calculateLine({
      quantity: '1',
      unitRate: '100',
      discountAmount: '10', // taxable becomes 90
      taxRate: '18' // 18% of 90 is 16.2
    });
    expect(res.subtotal.toNumber()).toBe(100);
    expect(res.taxAmount.toNumber()).toBe(16.20);
    expect(res.lineAmount.toNumber()).toBe(107);
  });

  it('throws on negative inputs', () => {
    expect(() => BillingCalculationService.calculateLine({ quantity: '-1', unitRate: '10' }))
      .toThrow('Quantity cannot be negative');
  });

  it('calculates document totals correctly', () => {
    const line1 = BillingCalculationService.calculateLine({ quantity: '1', unitRate: '100', discountAmount: '10', taxRate: '18' });
    const line2 = BillingCalculationService.calculateLine({ quantity: '2', unitRate: '50', discountAmount: '0', taxRate: '5' }); // sub: 100, tax: 5, total: 105

    const totals = BillingCalculationService.calculateTotals([line1, line2]);
    expect(totals.subtotal.toNumber()).toBe(200);
    expect(totals.discountTotal.toNumber()).toBe(10);
    expect(totals.taxTotal.toNumber()).toBe(21.20); // 16.20 + 5.00
    expect(totals.grandTotal.toNumber()).toBe(212);
  });
});
