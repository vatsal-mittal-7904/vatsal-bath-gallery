import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';

export class DocumentSequenceService {
  static async getNextEstimateNumber(tx?: Prisma.TransactionClient): Promise<string> {
    return this.getNextNumber('ESTIMATE', 'EST-', tx);
  }

  static async getNextBillNumber(tx?: Prisma.TransactionClient): Promise<string> {
    return this.getNextNumber('BILL', 'INV-', tx);
  }

  private static async getNextNumber(id: string, prefix: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx || prisma;
    const seq = await client.documentSequence.upsert({
      where: { id },
      create: { id, prefix, lastValue: 1 },
      update: { lastValue: { increment: 1 } }
    });
    
    // e.g., INV-000001
    return `${seq.prefix}${seq.lastValue.toString().padStart(6, '0')}`;
  }
}
