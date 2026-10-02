import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').transform(str => str.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required').max(1024, 'Password too long'),
});

export type LoginRequest = z.infer<typeof loginSchema>;
