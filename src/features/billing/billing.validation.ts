import { z } from 'zod';
import { EstimateStatus, BillStatus, PaymentMethod } from '@prisma/client';

// We use string schemas that must represent valid decimals.
const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Must be a valid positive decimal number string");

export const customerSchema = z.object({
  name: z.string().min(1).max(255),
  phoneNumber: z.string().min(5).max(20),
  email: z.string().email().optional().nullable(),
  billingAddress: z.string().max(1000).optional().nullable(),
  gstin: z.string().max(50).optional().nullable(),
  isActive: z.boolean().default(true)
});
export const customerUpdateSchema = customerSchema.partial();

export const estimateLineSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  variantId: z.string().uuid().optional().nullable(),
  productSnapshot: z.string().min(1),
  variantSnapshot: z.string().optional().nullable(),
  skuSnapshot: z.string().optional().nullable(),
  quantity: decimalString,
  unitOfMeasure: z.string().optional().nullable(),
  unitRate: decimalString,
  discountAmount: decimalString.default('0'),
  taxRate: decimalString.default('0'),
  taxAmount: decimalString.optional(),
  subtotal: decimalString.optional(),
  lineAmount: decimalString.optional(),
  sortOrder: z.number().int().optional().default(0),
  parchaRowId: z.string().uuid().optional().nullable(),
});

export const estimateSchema = z.object({
  estimateNumber: z.string().min(1).max(50).optional(),
  customerId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(EstimateStatus).default(EstimateStatus.DRAFT),
  issueDate: z.coerce.date(),
  validityDate: z.coerce.date().optional().nullable(),
  subtotal: decimalString.optional().default('0'),
  discountTotal: decimalString.optional().default('0'),
  taxTotal: decimalString.optional().default('0'),
  grandTotal: decimalString.optional().default('0'),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  parchaJobId: z.string().uuid().optional().nullable(),
  lines: z.array(estimateLineSchema).min(1)
});

export const estimateUpdateSchema = z.object({
  version: z
    .number()
    .int("Version must be an integer")
    .min(0, "Version must be a non-negative integer"),
  customerId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(EstimateStatus).optional(),
  issueDate: z.coerce.date().optional(),
  validityDate: z.coerce.date().optional().nullable(),
  subtotal: decimalString.optional(),
  discountTotal: decimalString.optional(),
  taxTotal: decimalString.optional(),
  grandTotal: decimalString.optional(),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  lines: z.array(estimateLineSchema).min(1).optional()
});

export const estimateStatusUpdateSchema = z.object({
  status: z.nativeEnum(EstimateStatus),
  version: z
    .number()
    .int("Version must be an integer")
    .min(0, "Version must be a non-negative integer")
});

export const estimateConvertSchema = z.object({
  version: z
    .number()
    .int("Version must be an integer")
    .min(0, "Version must be a non-negative integer")
});

export const billLineSchema = z.object({
  variantId: z.string().uuid().optional().nullable(),
  productSnapshot: z.string().min(1),
  variantSnapshot: z.string().optional().nullable(),
  skuSnapshot: z.string().optional().nullable(),
  quantity: decimalString,
  unitOfMeasure: z.string().optional().nullable(),
  unitRate: decimalString,
  discountAmount: decimalString,
  taxRate: decimalString,
  taxAmount: decimalString,
  subtotal: decimalString,
  lineAmount: decimalString,
  sortOrder: z.number().int().default(0)
});

export const billSchema = z.object({
  billNumber: z.string().min(1).max(50),
  estimateId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(BillStatus).default(BillStatus.DRAFT),
  issueDate: z.coerce.date(),
  subtotal: decimalString,
  discountTotal: decimalString,
  taxTotal: decimalString,
  grandTotal: decimalString,
  amountPaid: decimalString,
  balanceDue: decimalString,
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  lines: z.array(billLineSchema).min(1)
});

export const billUpdateSchema = billSchema.partial().extend({
  status: z.nativeEnum(BillStatus).optional()
});

export const billStatusUpdateSchema = z.object({
  status: z.nativeEnum(BillStatus),
  locationId: z.string().uuid().optional().nullable(),
  reason: z.string().max(1000).optional().nullable()
});

export const paymentSchema = z.object({
  billId: z.string().uuid(),
  amount: decimalString,
  paymentDate: z.coerce.date().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  transactionRef: z.string().max(255).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
});
