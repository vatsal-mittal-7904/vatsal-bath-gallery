import { z } from 'zod';
import { MovementType, TransferStatus } from '@prisma/client';

export const locationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const balanceSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().min(0, "Balance cannot be negative"), // Negative overall balance is strictly avoided
  reserved: z.number().min(0).default(0),
});

export const stockMovementSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  type: z.nativeEnum(MovementType),
  quantity: z.number().positive("Movement quantity must be an absolute positive value"),
  reference: z.string().max(255).optional().nullable(),
  reason: z.string().max(1000).optional().nullable(),
  transferId: z.string().uuid().optional().nullable(),
});

export const stockTransferSchema = z.object({
  sourceId: z.string().uuid(),
  destinationId: z.string().uuid(),
  status: z.nativeEnum(TransferStatus).default('PENDING'),
  reference: z.string().optional().nullable(),
});
