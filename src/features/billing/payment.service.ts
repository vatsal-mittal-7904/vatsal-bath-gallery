/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { BillStatus, PaymentMethod, Prisma } from '@prisma/client';
import { SafePayment } from './billing.types';
import { isRetryableDbError } from '../inventory/inventory.service';

export type PaymentTestHook = (stage: string, context?: any) => Promise<void>;
let activePaymentTestHook: PaymentTestHook | null = null;

export function __setPaymentTestHook(hook: PaymentTestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activePaymentTestHook = hook;
  }
}

export class PaymentService {
  static __setPaymentTestHook(hook: PaymentTestHook | null) {
    __setPaymentTestHook(hook);
  }

  static async recordPayment(billId: string, data: {
    amount: string,
    paymentDate?: Date,
    paymentMethod: PaymentMethod,
    transactionRef?: string | null,
    notes?: string | null,
    recordedById?: string,
    idempotencyKey?: string
  }): Promise<SafePayment> {
    let payAmount: Prisma.Decimal;
    try {
      payAmount = new Prisma.Decimal(data.amount);
    } catch {
      throw new ValidationError("Invalid payment amount.");
    }
    if (payAmount.lte(0)) throw new ValidationError("Payment amount must be positive.");
    
    if (data.idempotencyKey) {
      const [existingBill, existingMovement, existing] = await Promise.all([
        prisma.bill.findUnique({ where: { idempotencyKey: data.idempotencyKey } }),
        prisma.stockMovement.findFirst({
          where: {
            OR: [
              { idempotencyKey: data.idempotencyKey },
              { idempotencyKey: { startsWith: `${data.idempotencyKey}:` } }
            ]
          }
        }),
        prisma.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } })
      ]);
      if (existingBill) {
        throw new ConflictError("Idempotency key already used for another bill.");
      }
      if (existingMovement) {
        throw new ConflictError("Idempotency key already used for another operation.");
      }
      if (existing) {
        this.assertPaymentPayloadEquivalence(existing, {
          billId,
          amount: payAmount,
          paymentMethod: data.paymentMethod,
          transactionRef: data.transactionRef,
          explicitPaymentDate: data.paymentDate ? new Date(data.paymentDate) : null
        });
        return this.toSafePayment(existing);
      }
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await prisma.$transaction(async (tx) => {
          // 1. Level 7 Lock: Bill row FOR UPDATE
          const bills: Array<{
            id: string;
            status: BillStatus;
            balanceDue: Prisma.Decimal;
            amountPaid: Prisma.Decimal;
            grandTotal: Prisma.Decimal;
          }> = await tx.$queryRaw`
            SELECT id, status, "balanceDue", "amountPaid", "grandTotal"
            FROM "Bill"
            WHERE id = ${billId}
            FOR UPDATE
          `;

          if (bills.length === 0) throw new NotFoundError("Bill not found");
          const bill = bills[0]!;

          if (activePaymentTestHook) {
            await activePaymentTestHook('after_bill_lock', { bill });
          }

          // 2. Authoritative Lifecycle & Status Checks
          if (bill.status === BillStatus.CANCELLED) {
            throw new ConflictError("Cannot record payment for a cancelled bill.");
          }

          if (bill.status === BillStatus.DRAFT) {
            throw new ConflictError("Cannot record payment for a draft bill. The bill must be issued first.");
          }

          const currentBalance = new Prisma.Decimal(bill.balanceDue.toString());
          if (bill.status === BillStatus.PAID || currentBalance.lte(0)) {
            throw new ConflictError("Cannot record payment for a bill that is already fully paid.");
          }

          if (bill.status !== BillStatus.ISSUED && bill.status !== BillStatus.PARTIALLY_PAID) {
            throw new ConflictError(`Cannot record payment for a bill in status ${bill.status}.`);
          }

          // 3. Overpayment Check
          if (payAmount.gt(currentBalance)) {
            throw new ConflictError("Payment amount exceeds balance due.");
          }

          if (activePaymentTestHook) {
            await activePaymentTestHook('before_payment_insert', { bill, payAmount });
          }

          // 4. Create Payment Record
          const payment = await tx.payment.create({
            data: {
              billId,
              amount: payAmount,
              paymentDate: data.paymentDate,
              paymentMethod: data.paymentMethod,
              transactionRef: data.transactionRef,
              notes: data.notes,
              recordedById: data.recordedById,
              idempotencyKey: data.idempotencyKey
            }
          });

          if (activePaymentTestHook) {
            await activePaymentTestHook('after_payment_insert', { payment });
          }

          // 5. Update Bill Financial State and Status Atomically
          const newAmountPaid = new Prisma.Decimal(bill.amountPaid.toString()).add(payAmount);
          const newBalanceDue = currentBalance.sub(payAmount);
          const newStatus = newBalanceDue.isZero() ? BillStatus.PAID : BillStatus.PARTIALLY_PAID;

          await tx.bill.update({
            where: { id: billId },
            data: {
              amountPaid: newAmountPaid,
              balanceDue: newBalanceDue,
              status: newStatus
            }
          });

          if (activePaymentTestHook) {
            await activePaymentTestHook('before_commit', { payment, newStatus });
          }

          return this.toSafePayment(payment);
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (err: any) {
        if (err.code === 'P2002' && data.idempotencyKey) {
          const existing = await prisma.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
          if (existing) {
            this.assertPaymentPayloadEquivalence(existing, {
              billId,
              amount: payAmount,
              paymentMethod: data.paymentMethod,
              transactionRef: data.transactionRef,
              explicitPaymentDate: data.paymentDate ? new Date(data.paymentDate) : null
            });
            return this.toSafePayment(existing);
          }
        }

        if (attempts < maxAttempts && isRetryableDbError(err)) {
          await new Promise(r => setTimeout(r, 20 * Math.pow(2, attempts) + Math.random() * 20));
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError("Transaction conflict: maximum retry attempts exceeded during payment recording.");
  }

  static async getPaymentsByBill(billId: string): Promise<SafePayment[]> {
    const payments = await prisma.payment.findMany({
      where: { billId },
      orderBy: { paymentDate: 'desc' }
    });
    return payments.map(this.toSafePayment);
  }

  static toSafePayment(payment: any): SafePayment {
    const { createdAt, updatedAt, amount, ...safe } = payment;
    return {
      ...safe,
      amount: amount.toString()
    };
  }

  static assertPaymentPayloadEquivalence(
    existing: any,
    requested: {
      billId: string;
      amount: Prisma.Decimal;
      paymentMethod: PaymentMethod;
      transactionRef?: string | null;
      explicitPaymentDate?: Date | null;
    }
  ): void {
    if (existing.billId !== requested.billId) {
      throw new ConflictError("Idempotency key already used for another payment.");
    }
    if (!new Prisma.Decimal(existing.amount.toString()).equals(requested.amount)) {
      throw new ConflictError(
        `Idempotency key already used with different payment amount. Original: ${existing.amount.toString()}, requested: ${requested.amount.toString()}.`
      );
    }
    if (existing.paymentMethod !== requested.paymentMethod) {
      throw new ConflictError(
        `Idempotency key already used with different payment method. Original: ${existing.paymentMethod}, requested: ${requested.paymentMethod}.`
      );
    }
    const existingRef = existing.transactionRef?.trim() || null;
    const requestedRef = requested.transactionRef?.trim() || null;
    if (existingRef !== requestedRef) {
      throw new ConflictError("Idempotency key already used with different transaction reference.");
    }
    if (requested.explicitPaymentDate) {
      const existingTime = new Date(existing.paymentDate).getTime();
      const requestedTime = requested.explicitPaymentDate.getTime();
      if (existingTime !== requestedTime) {
        throw new ConflictError(
          `Idempotency key already used with different payment date. Original: ${new Date(existing.paymentDate).toISOString()}, requested: ${requested.explicitPaymentDate.toISOString()}.`
        );
      }
    }
  }
}
