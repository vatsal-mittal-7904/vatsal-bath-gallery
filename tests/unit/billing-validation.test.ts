/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { 
  customerSchema, 
  estimateSchema, 
  estimateUpdateSchema,
  estimateStatusUpdateSchema,
  billSchema, 
  paymentSchema 
} from '../../src/features/billing/billing.validation';
import { EstimateStatus, BillStatus, PaymentMethod } from '@prisma/client';

describe('Billing Validation Schemas', () => {
  describe('Customer', () => {
    it('validates a correct customer payload', () => {
      const data = {
        name: 'John Doe',
        phoneNumber: '9876543210',
      };
      const result = customerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects short phone numbers', () => {
      const data = {
        name: 'John',
        phoneNumber: '123'
      };
      const result = customerSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Estimate', () => {
    it('validates valid decimal strings', () => {
      const data = {
        estimateNumber: 'EST-1',
        issueDate: new Date(),
        subtotal: '100.50',
        discountTotal: '0',
        taxTotal: '18.09',
        grandTotal: '118.59',
        lines: [
          {
            productSnapshot: 'Item A',
            quantity: '1.5',
            unitRate: '67.00',
            discountAmount: '0',
            taxRate: '18',
            taxAmount: '18.09',
            subtotal: '100.50',
            lineAmount: '118.59'
          }
        ]
      };
      const result = estimateSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects invalid decimal strings', () => {
      const data = {
        estimateNumber: 'EST-2',
        issueDate: new Date(),
        subtotal: '100.abc', // invalid
        discountTotal: '0',
        taxTotal: '0',
        grandTotal: '100',
        lines: [
          {
            productSnapshot: 'Item B',
            quantity: '1',
            unitRate: '100',
            discountAmount: '0',
            taxRate: '0',
            taxAmount: '0',
            subtotal: '100',
            lineAmount: '100'
          }
        ]
      };
      const result = estimateSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('Estimate Update Schema (Mandatory Version)', () => {
    it('accepts valid version and optional update fields', () => {
      const result = estimateUpdateSchema.safeParse({
        version: 0,
        notes: 'Updated notes'
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing version', () => {
      const result = estimateUpdateSchema.safeParse({
        notes: 'Missing version'
      });
      expect(result.success).toBe(false);
    });

    it('rejects null version', () => {
      const result = estimateUpdateSchema.safeParse({
        version: null,
        notes: 'Null version'
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative version', () => {
      const result = estimateUpdateSchema.safeParse({
        version: -1
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Version must be a non-negative integer');
    });

    it('rejects fractional version', () => {
      const result = estimateUpdateSchema.safeParse({
        version: 1.5
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Version must be an integer');
    });

    it('rejects string version', () => {
      const result = estimateUpdateSchema.safeParse({
        version: '0'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Estimate Status Update Schema', () => {
    it('accepts valid status and version', () => {
      const result = estimateStatusUpdateSchema.safeParse({
        status: EstimateStatus.SENT,
        version: 0
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing version in status update', () => {
      const result = estimateStatusUpdateSchema.safeParse({
        status: EstimateStatus.SENT
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = estimateStatusUpdateSchema.safeParse({
        status: 'INVALID_STATUS',
        version: 0
      });
      expect(result.success).toBe(false);
    });
  });
});

