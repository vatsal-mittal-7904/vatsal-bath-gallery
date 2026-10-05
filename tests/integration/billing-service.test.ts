/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { EstimateService } from '../../src/features/billing/estimate.service';
import { BillService } from '../../src/features/billing/bill.service';
import { PaymentService } from '../../src/features/billing/payment.service';
import { CustomerService } from '../../src/features/billing/customer.service';
import { EstimateStatus, BillStatus, PaymentMethod } from '@prisma/client';

describe('Billing Services Integration', () => {
  let customerId = '';
  
  beforeAll(async () => {
    const customer = await CustomerService.createCustomer({
      name: 'Service Test Customer',
      phoneNumber: '5551234567'
    });
    customerId = customer.id;
    const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true, isActive: true } });
    if (!loc) {
      await prisma.inventoryLocation.create({
        data: { name: 'Billing Service Test Store', code: 'BST-STORE', isDefault: true, isActive: true }
      });
    }
  });

  afterAll(async () => {
    if (customerId) {
      const bills = await prisma.bill.findMany({ where: { customerId } });
      const billIds = bills.map((b) => b.id);
      await prisma.payment.deleteMany({ where: { billId: { in: billIds } } });
      await prisma.billLine.deleteMany({ where: { billId: { in: billIds } } });
      await prisma.bill.deleteMany({ where: { id: { in: billIds } } });

      const estimates = await prisma.estimate.findMany({ where: { customerId } });
      const estimateIds = estimates.map((e) => e.id);
      await prisma.estimateLine.deleteMany({ where: { estimateId: { in: estimateIds } } });
      await prisma.estimate.deleteMany({ where: { id: { in: estimateIds } } });

      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it('creates estimate, converts to bill, and processes payments safely', async () => {
    // 1. Create Estimate
    const estimate = await EstimateService.createEstimate({
      customerId,
      issueDate: new Date(),
      lines: [
        {
          productSnapshot: 'Test Pipe',
          quantity: '5',
          unitRate: '100',
          discountAmount: '0',
          taxRate: '18'
        }
      ]
    });
    
    expect(estimate.estimateNumber).toMatch(/^EST-\d+/);
    expect(estimate.subtotal).toBe('500');
    expect(estimate.taxTotal).toBe('90');
    expect(estimate.grandTotal).toBe('590');
    expect(estimate.status).toBe(EstimateStatus.DRAFT);

    // Transition to ACCEPTED (only ACCEPTED estimates are eligible for conversion)
    await EstimateService.updateStatus(estimate.id, EstimateStatus.SENT, estimate.version);
    const sentEst = await EstimateService.getEstimate(estimate.id);
    const acceptedEst = await EstimateService.updateStatus(estimate.id, EstimateStatus.ACCEPTED, sentEst.version);

    // 2. Convert to Bill
    const bill = await BillService.convertEstimateToBill(estimate.id, acceptedEst.version);
    expect(bill.billNumber).toMatch(/^INV-\d+/);
    expect(bill.subtotal).toBe('500');
    expect(bill.grandTotal).toBe('590');
    expect(bill.balanceDue).toBe('590');
    
    // Verify estimate status updated
    const updatedEst = await EstimateService.getEstimate(estimate.id);
    expect(updatedEst.status).toBe(EstimateStatus.CONVERTED);

    // 3. Prevent duplicate conversion
    await expect(BillService.convertEstimateToBill(estimate.id, updatedEst.version)).rejects.toThrow(/cannot be converted|already been converted/);

    // 4. Process Payment (must issue bill first)
    await BillService.issueBill(bill.id);
    const payment = await PaymentService.recordPayment(bill.id, {
      amount: '500',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    });

    const updatedBill = await BillService.getBill(bill.id);
    expect(updatedBill.amountPaid).toBe('500');
    expect(updatedBill.balanceDue).toBe('90');
    expect(updatedBill.status).toBe(BillStatus.PARTIALLY_PAID); // Auto transition

    // 5. Prevent overpayment
    await expect(PaymentService.recordPayment(bill.id, {
      amount: '100', // exceeds balance of 90
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    })).rejects.toThrow(/exceeds balance due/);
  });
});
