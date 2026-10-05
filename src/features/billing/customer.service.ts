/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { SafeCustomer } from './billing.types';

export class CustomerService {
  static async createCustomer(data: { name: string, phoneNumber: string, email?: string | null, billingAddress?: string | null, gstin?: string | null, isActive?: boolean }): Promise<SafeCustomer> {
    const customer = await prisma.customer.create({
      data
    });
    return this.toSafeCustomer(customer);
  }

  static async updateCustomer(id: string, data: Partial<{ name: string, phoneNumber: string, email?: string | null, billingAddress?: string | null, gstin?: string | null, isActive?: boolean }>): Promise<SafeCustomer> {
    try {
      const customer = await prisma.customer.update({
        where: { id },
        data
      });
      return this.toSafeCustomer(customer);
    } catch (err: any) {
      if (err.code === 'P2025') throw new NotFoundError('Customer not found');
      throw err;
    }
  }

  static async archiveCustomer(id: string): Promise<SafeCustomer> {
    return this.updateCustomer(id, { isActive: false });
  }

  static async getCustomer(id: string): Promise<SafeCustomer> {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundError('Customer not found');
    return this.toSafeCustomer(customer);
  }

  static async getCustomers(page = 1, limit = 50, filters?: { search?: string, isActive?: boolean }): Promise<{ items: SafeCustomer[], total: number }> {
    const where: any = {};
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.customer.count({ where })
    ]);

    return { items: items.map(this.toSafeCustomer), total };
  }

  static toSafeCustomer(customer: any): SafeCustomer {
    const { createdAt, updatedAt, ...safe } = customer;
    return safe;
  }
}
