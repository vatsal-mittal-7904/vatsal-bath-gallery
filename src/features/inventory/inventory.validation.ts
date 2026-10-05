/* eslint-disable */
import { z } from 'zod';
import { MovementType, TransferStatus } from '@prisma/client';

export const locationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const locationUpdateSchema = locationSchema.partial();

export const openingStockSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive("Opening stock must be positive"),
  reason: z.string().min(1).max(1000),
  idempotencyKey: z.string().max(255).optional(),
});

export const stockReceiptSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive("Receipt quantity must be positive"),
  reference: z.string().min(1).max(255),
  reason: z.string().max(1000).optional(),
  idempotencyKey: z.string().max(255).optional(),
});

export const stockIssueSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive("Issue quantity must be positive"),
  reference: z.string().min(1).max(255),
  reason: z.string().max(1000).optional(),
  idempotencyKey: z.string().max(255).optional(),
});

export const stockAdjustmentSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive("Adjustment quantity must be absolute positive"),
  type: z.enum([MovementType.POSITIVE_ADJUSTMENT, MovementType.NEGATIVE_ADJUSTMENT]),
  reason: z.string().min(1).max(1000),
  reference: z.string().max(255).optional(),
  idempotencyKey: z.string().max(255).optional(),
});

export const stockTransferSchema = z.object({
  variantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  destinationId: z.string().uuid(),
  quantity: z.number().positive("Transfer quantity must be positive"),
  reference: z.string().optional(),
  idempotencyKey: z.string().max(255).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});
