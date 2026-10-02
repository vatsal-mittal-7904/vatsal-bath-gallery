import { z } from 'zod';
import { Role } from '@prisma/client';

export const userCreateSchema = z.object({
  email: z.string().email().transform(str => str.toLowerCase().trim()),
  name: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(), // Defaults to STAFF in DB if not provided
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
});
