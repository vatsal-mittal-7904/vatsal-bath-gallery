import { Prisma } from '@prisma/client';

export type LineInput = {
  quantity: number | string | Prisma.Decimal;
  unitRate: number | string | Prisma.Decimal;
  discountAmount?: number | string | Prisma.Decimal;
  taxRate?: number | string | Prisma.Decimal;
};

export type LineOutput = {
  quantity: Prisma.Decimal;
  unitRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  subtotal: Prisma.Decimal; // Qty * UnitRate
  taxAmount: Prisma.Decimal;
  lineAmount: Prisma.Decimal; // (Subtotal - Discount) + TaxAmount
};

export type DocumentTotals = {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
};

export class BillingCalculationService {
  /**
   * Calculates a single line item safely.
   */
  static calculateLine(input: LineInput): LineOutput {
    const qty = new Prisma.Decimal(input.quantity || 0);
    const rate = new Prisma.Decimal(input.unitRate || 0);
    const discount = new Prisma.Decimal(input.discountAmount || 0);
    const taxRate = new Prisma.Decimal(input.taxRate || 0);

    if (qty.isNegative()) throw new Error("Quantity cannot be negative.");
    if (rate.isNegative()) throw new Error("Unit rate cannot be negative.");
    if (discount.isNegative()) throw new Error("Discount cannot be negative.");
    if (taxRate.isNegative()) throw new Error("Tax rate cannot be negative.");

    const subtotal = qty.mul(rate).ceil(); // ceiling round the initial multiplication
    
    if (discount.greaterThan(subtotal)) {
      throw new Error("Discount cannot exceed line subtotal.");
    }

    const taxableAmount = subtotal.sub(discount);
    const taxAmount = taxableAmount.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    
    const lineAmount = taxableAmount.add(taxAmount).ceil(); // ceiling round the final line amount

    return {
      quantity: qty,
      unitRate: rate,
      discountAmount: discount,
      taxRate,
      subtotal,
      taxAmount,
      lineAmount
    };
  }

  /**
   * Sums up multiple calculated lines to compute the document totals.
   */
  static calculateTotals(lines: LineOutput[]): DocumentTotals {
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let grandTotal = new Prisma.Decimal(0);

    for (const line of lines) {
      subtotal = subtotal.add(line.subtotal);
      discountTotal = discountTotal.add(line.discountAmount);
      taxTotal = taxTotal.add(line.taxAmount);
      grandTotal = grandTotal.add(line.lineAmount);
    }

    return {
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal
    };
  }
}
