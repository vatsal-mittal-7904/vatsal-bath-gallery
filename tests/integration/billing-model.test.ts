/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { EstimateStatus, BillStatus, PaymentMethod } from '@prisma/client';

describe('Billing and Estimate Models', () => {
  let customerId = '';
  
  beforeAll(async () => {
    await prisma.payment.deleteMany({ where: { bill: { billNumber: 'INV-001' } } });
    await prisma.billLine.deleteMany({ where: { bill: { billNumber: 'INV-001' } } });
    await prisma.bill.deleteMany({ where: { billNumber: 'INV-001' } });
    await prisma.estimateLine.deleteMany({ where: { estimate: { estimateNumber: 'EST-001' } } });
    await prisma.estimate.deleteMany({ where: { estimateNumber: 'EST-001' } });

    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer',
        phoneNumber: '1234567890'
      }
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { bill: { billNumber: 'INV-001' } } });
    await prisma.billLine.deleteMany({ where: { bill: { billNumber: 'INV-001' } } });
    await prisma.bill.deleteMany({ where: { billNumber: 'INV-001' } });
    await prisma.estimateLine.deleteMany({ where: { estimate: { estimateNumber: 'EST-001' } } });
    await prisma.estimate.deleteMany({ where: { estimateNumber: 'EST-001' } });
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it('creates an estimate with lines successfully', async () => {
    const estimate = await prisma.estimate.create({
      data: {
        estimateNumber: 'EST-001',
        customerId,
        status: EstimateStatus.DRAFT,
        subtotal: 100.50,
        discountTotal: 10.00,
        taxTotal: 16.29,
        grandTotal: 106.79,
        lines: {
          create: [
            {
              productSnapshot: 'Pipe',
              quantity: 2,
              unitRate: 50.25,
              subtotal: 100.50,
              lineAmount: 100.50
            }
          ]
        }
      },
      include: { lines: true }
    });

    expect(estimate.estimateNumber).toBe('EST-001');
    expect(estimate.lines.length).toBe(1);
    expect(estimate.lines![0].quantity.toNumber()).toBe(2);
    expect(estimate.lines![0].unitRate.toNumber()).toBe(50.25);
  });

  it('prevents duplicate estimate numbers', async () => {
    await expect(
      prisma.estimate.create({
        data: {
          estimateNumber: 'EST-001', // duplicate
          customerId,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 0
        }
      })
    ).rejects.toThrow();
  });

  it('creates a bill with payments', async () => {
    const bill = await prisma.bill.create({
      data: {
        billNumber: 'INV-001',
        customerId,
        status: BillStatus.ISSUED,
        subtotal: 500,
        discountTotal: 0,
        taxTotal: 90,
        grandTotal: 590,
        amountPaid: 0,
        balanceDue: 590,
        lines: {
          create: [
            {
              productSnapshot: 'Fitting',
              quantity: 10,
              unitRate: 50,
              subtotal: 500,
              lineAmount: 590,
              taxRate: 18,
              taxAmount: 90
            }
          ]
        },
        payments: {
          create: [
            {
              amount: 200,
              paymentMethod: PaymentMethod.CASH
            }
          ]
        }
      },
      include: { lines: true, payments: true }
    });

    expect(bill.billNumber).toBe('INV-001');
    expect(bill.lines.length).toBe(1);
    expect(bill.payments.length).toBe(1);
    expect(bill.payments![0].amount.toNumber()).toBe(200);
  });
});
