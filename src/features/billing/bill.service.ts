/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError, InsufficientStockError } from '@/lib/errors';
import { BillStatus, EstimateStatus, MovementType, Prisma } from '@prisma/client';
import { SafeBill, SafeBillLine, SafeBillLineProfit, SafeBillProfit } from './billing.types';
import { BillingCalculationService } from './billing-calculation.service';
import { DocumentSequenceService } from './document-sequence.service';
import { CustomerService } from './customer.service';
import { toSafeLocation } from '../inventory/inventory.utils';
import { InventoryService, isRetryableDbError } from '../inventory/inventory.service';

export type BillTestHook = (stage: string, context?: any) => Promise<void>;
let activeBillTestHook: BillTestHook | null = null;

export function __setBillTestHook(hook: BillTestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activeBillTestHook = hook;
  }
}

export class BillService {
  static __setBillTestHook(hook: BillTestHook | null) {
    __setBillTestHook(hook);
  }

  static async createBill(data: {
    customerId?: string | null,
    locationId?: string | null,
    issueDate: Date,
    notes?: string | null,
    terms?: string | null,
    idempotencyKey?: string,
    creatorId?: string,
    lines: Array<{
      variantId?: string | null,
      productSnapshot: string,
      variantSnapshot?: string | null,
      skuSnapshot?: string | null,
      quantity: string,
      unitOfMeasure?: string | null,
      unitRate: string,
      discountAmount: string,
      taxRate: string
    }>
  }): Promise<SafeBill> {
    if (data.idempotencyKey) {
      const existing = await prisma.bill.findUnique({ where: { idempotencyKey: data.idempotencyKey }, include: { lines: true, customer: true, location: true } });
      if (existing) return this.toSafeBill(existing);
    }

    if (data.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
      if (!customer?.isActive) throw new ValidationError("Invalid or inactive customer.");
    }

    const calculatedLines = await this.prepareLines(data.lines);
    const totals = BillingCalculationService.calculateTotals(calculatedLines.map(l => l.calc));

    return await prisma.$transaction(async (tx) => {
      const billNumber = await DocumentSequenceService.getNextBillNumber(tx);

      const bill = await tx.bill.create({
        data: {
          billNumber,
          customerId: data.customerId,
          locationId: data.locationId,
          issueDate: data.issueDate,
          status: BillStatus.DRAFT,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          amountPaid: 0,
          balanceDue: totals.grandTotal,
          notes: data.notes,
          terms: data.terms,
          creatorId: data.creatorId,
          idempotencyKey: data.idempotencyKey,
          lines: {
            create: calculatedLines.map((l, i) => ({
              variantId: l.input.variantId,
              productSnapshot: l.input.productSnapshot,
              variantSnapshot: l.input.variantSnapshot,
              skuSnapshot: l.input.skuSnapshot,
              quantity: l.calc.quantity,
              unitOfMeasure: l.input.unitOfMeasure,
              unitRate: l.calc.unitRate,
              discountAmount: l.calc.discountAmount,
              taxRate: l.calc.taxRate,
              taxAmount: l.calc.taxAmount,
              subtotal: l.calc.subtotal,
              lineAmount: l.calc.lineAmount,
              sortOrder: i
            }))
          }
        },
        include: { lines: true, customer: true, location: true }
      });

      return this.toSafeBill(bill);
    });
  }

  static async convertEstimateToBill(
    estimateId: string,
    expectedVersion: number,
    creatorId?: string,
    idempotencyKey?: string
  ): Promise<SafeBill> {
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new ValidationError("Valid non-negative integer version is required");
    }

    if (idempotencyKey) {
      const existing = await prisma.bill.findUnique({
        where: { idempotencyKey },
        include: {
          lines: true,
          customer: true,
          estimate: { select: { id: true, estimateNumber: true } }
        }
      });
      if (existing) {
        if (existing.estimateId === estimateId) {
          return this.toSafeBill(existing);
        } else {
          throw new ConflictError("Idempotency key already used for another bill.");
        }
      }
    }

    return await prisma.$transaction(async (tx) => {
      const estimate = await tx.estimate.findUnique({
        where: { id: estimateId },
        include: { lines: { orderBy: { sortOrder: 'asc' } } }
      });
      if (!estimate) throw new NotFoundError("Estimate not found");

      // Verify eligibility: ONLY ACCEPTED status is convertible
      if (estimate.status !== EstimateStatus.ACCEPTED) {
        if (estimate.status === EstimateStatus.CONVERTED) {
          const existingBill = await tx.bill.findUnique({
            where: { estimateId },
            include: {
              lines: true,
              customer: true,
              estimate: { select: { id: true, estimateNumber: true } }
            }
          });
          if (existingBill && idempotencyKey && existingBill.idempotencyKey === idempotencyKey) {
            return this.toSafeBill(existingBill);
          }
          throw new ConflictError("This estimate has already been converted to a bill.");
        }
        throw new ConflictError(`Only accepted estimates can be converted to bills. Current status: ${estimate.status}.`);
      }

      // Check version
      if (estimate.version !== expectedVersion) {
        throw new ConflictError(`Estimate was modified concurrently. Expected version ${expectedVersion}, but found ${estimate.version}.`);
      }

      // Verify lines
      if (!estimate.lines || estimate.lines.length === 0) {
        throw new ValidationError("Estimate must contain at least one line item to be converted to a bill.");
      }

      // Customer validation with FOR SHARE lock (Customer is Level 5, Estimate Level 6, Bill Level 7)
      if (estimate.customerId) {
        const customers: Array<{ id: string; isActive: boolean }> = await tx.$queryRaw`
          SELECT id, "isActive" FROM "Customer" WHERE id = ${estimate.customerId} FOR SHARE
        `;
        if (!customers.length || !customers[0]?.isActive) {
          throw new ValidationError("Customer associated with this estimate is invalid or inactive.");
        }
      }

      // Authoritative recalculation using Phase 5 upward ceiling rounding
      const calculatedLines = estimate.lines.map((l, index) => {
        const calc = BillingCalculationService.calculateLine({
          quantity: l.quantity.toString(),
          unitRate: l.unitRate.toString(),
          discountAmount: l.discountAmount.toString(),
          taxRate: l.taxRate.toString()
        });
        return {
          source: l,
          calc,
          sortOrder: l.sortOrder ?? index
        };
      });
      const totals = BillingCalculationService.calculateTotals(calculatedLines.map(c => c.calc));

      // Atomic transition of estimate status from ACCEPTED to CONVERTED and version bump
      const updatedEstimate = await tx.estimate.updateMany({
        where: {
          id: estimateId,
          status: EstimateStatus.ACCEPTED,
          version: expectedVersion
        },
        data: {
          status: EstimateStatus.CONVERTED,
          version: { increment: 1 }
        }
      });
      if (updatedEstimate.count === 0) {
        if (idempotencyKey) {
          const existingBill = await tx.bill.findUnique({
            where: { idempotencyKey },
            include: {
              lines: true,
              customer: true,
              estimate: { select: { id: true, estimateNumber: true } }
            }
          });
          if (existingBill && existingBill.estimateId === estimateId) {
            return this.toSafeBill(existingBill);
          }
        }
        throw new ConflictError("Estimate was concurrently modified or already converted.");
      }

      const billNumber = await DocumentSequenceService.getNextBillNumber(tx);

      try {
        const bill = await tx.bill.create({
          data: {
            billNumber,
            estimateId,
            customerId: estimate.customerId,
            issueDate: new Date(),
            status: BillStatus.DRAFT,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            grandTotal: totals.grandTotal,
            amountPaid: 0,
            balanceDue: totals.grandTotal,
            notes: estimate.notes,
            terms: estimate.terms,
            creatorId,
            idempotencyKey,
            lines: {
              create: calculatedLines.map(l => ({
                variantId: l.source.variantId,
                productSnapshot: l.source.productSnapshot,
                variantSnapshot: l.source.variantSnapshot,
                skuSnapshot: l.source.skuSnapshot,
                quantity: l.calc.quantity,
                unitOfMeasure: l.source.unitOfMeasure,
                unitRate: l.calc.unitRate,
                discountAmount: l.calc.discountAmount,
                taxRate: l.calc.taxRate,
                taxAmount: l.calc.taxAmount,
                subtotal: l.calc.subtotal,
                lineAmount: l.calc.lineAmount,
                sortOrder: l.sortOrder
              }))
            }
          },
          include: {
            lines: true,
            customer: true,
            estimate: { select: { id: true, estimateNumber: true } }
          }
        });
        return this.toSafeBill(bill);
      } catch (err: any) {
        if (err.code === 'P2002') {
          if (err.meta?.target?.includes('idempotencyKey')) {
            throw new ConflictError("Idempotency key already used for another bill.");
          }
          throw new ConflictError("This estimate has already been converted to a bill.");
        }
        throw err;
      }
    });
  }

  static async updateBill(id: string, data: {
    customerId?: string | null,
    locationId?: string | null,
    issueDate?: Date,
    notes?: string | null,
    terms?: string | null,
    status?: BillStatus,
    lines?: Array<{
      variantId?: string | null,
      productSnapshot: string,
      variantSnapshot?: string | null,
      skuSnapshot?: string | null,
      quantity: string,
      unitOfMeasure?: string | null,
      unitRate: string,
      discountAmount: string,
      taxRate: string
    }>
  }): Promise<SafeBill> {
    
    return await prisma.$transaction(async (tx) => {
      const bills: Array<{ id: string; status: BillStatus; locationId: string | null }> = await tx.$queryRaw`
        SELECT id, status, "locationId" FROM "Bill" WHERE id = ${id} FOR UPDATE
      `;
      if (bills.length === 0) throw new NotFoundError("Bill not found");

      const existing = await tx.bill.findUnique({ where: { id }, include: { lines: true } });
      if (!existing) throw new NotFoundError("Bill not found");
      
      // Usually bills shouldn't be edited if PAID/CANCELLED unless business rules permit.
      if (existing.status === BillStatus.PAID || existing.status === BillStatus.CANCELLED) {
        throw new ConflictError("Cannot edit a paid or cancelled bill.");
      }

      if (data.status !== undefined && data.status !== existing.status) {
        if (data.status === BillStatus.ISSUED || data.status === BillStatus.CANCELLED) {
          throw new ValidationError("Cannot transition to ISSUED or CANCELLED via bill update. Use dedicated issuance or cancellation actions.");
        }
        if (data.status === BillStatus.PAID || data.status === BillStatus.PARTIALLY_PAID) {
          throw new ValidationError("Cannot transition to PAID or PARTIALLY_PAID via bill update. These statuses are managed by payments.");
        }
        if (data.status === BillStatus.DRAFT && existing.status !== BillStatus.DRAFT) {
          throw new ConflictError("Cannot revert a non-draft bill to DRAFT status.");
        }
      }

      if (data.lines && data.lines.length > 0 && existing.status !== BillStatus.DRAFT) {
        throw new ConflictError("Cannot modify lines of a non-draft bill.");
      }

      if (data.locationId && data.locationId !== existing.locationId && existing.status !== BillStatus.DRAFT) {
        throw new ConflictError("Cannot change location of a non-draft bill.");
      }
      
      const newTotals = {
        subtotal: existing.subtotal,
        discountTotal: existing.discountTotal,
        taxTotal: existing.taxTotal,
        grandTotal: existing.grandTotal,
        balanceDue: existing.balanceDue
      };
      
      let updatedLinesData: any[] = [];
      let updateLines = false;

      if (data.lines && data.lines.length > 0) {
        const calculatedLines = await this.prepareLines(data.lines, tx);
        const calculated = BillingCalculationService.calculateTotals(calculatedLines.map(l => l.calc));
        newTotals.subtotal = calculated.subtotal;
        newTotals.discountTotal = calculated.discountTotal;
        newTotals.taxTotal = calculated.taxTotal;
        newTotals.grandTotal = calculated.grandTotal;
        newTotals.balanceDue = calculated.grandTotal.sub(existing.amountPaid);
        
        updatedLinesData = calculatedLines.map((l, i) => ({
          variantId: l.input.variantId,
          productSnapshot: l.input.productSnapshot,
          variantSnapshot: l.input.variantSnapshot,
          skuSnapshot: l.input.skuSnapshot,
          quantity: l.calc.quantity,
          unitOfMeasure: l.input.unitOfMeasure,
          unitRate: l.calc.unitRate,
          discountAmount: l.calc.discountAmount,
          taxRate: l.calc.taxRate,
          taxAmount: l.calc.taxAmount,
          subtotal: l.calc.subtotal,
          lineAmount: l.calc.lineAmount,
          sortOrder: i
        }));
        updateLines = true;
      }

      if (updateLines) {
        await tx.billLine.deleteMany({ where: { billId: id } });
      }

      const updated = await tx.bill.update({
        where: { id },
        data: {
          customerId: data.customerId !== undefined ? data.customerId : undefined,
          locationId: data.locationId !== undefined ? data.locationId : undefined,
          issueDate: data.issueDate !== undefined ? data.issueDate : undefined,
          notes: data.notes !== undefined ? data.notes : undefined,
          terms: data.terms !== undefined ? data.terms : undefined,
          status: data.status !== undefined ? data.status : undefined,
          subtotal: newTotals.subtotal,
          discountTotal: newTotals.discountTotal,
          taxTotal: newTotals.taxTotal,
          grandTotal: newTotals.grandTotal,
          balanceDue: newTotals.balanceDue,
          ...(updateLines && {
            lines: {
              create: updatedLinesData
            }
          })
        },
        include: { lines: true, customer: true, location: true }
      });
      return this.toSafeBill(updated);
    });
  }

  static async issueBill(
    id: string,
    options?: {
      locationId?: string | null;
      userId?: string;
      idempotencyKey?: string;
      reason?: string | null;
    }
  ): Promise<SafeBill> {
    const deductKey = options?.idempotencyKey || `bill-issue:${id}`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await prisma.$transaction(async (tx) => {
          // 1. Level 7 Lock: Bill row FOR UPDATE
          const bills: Array<{ id: string; status: BillStatus; locationId: string | null }> = await tx.$queryRaw`
            SELECT id, status, "locationId" FROM "Bill" WHERE id = ${id} FOR UPDATE
          `;
          if (bills.length === 0) throw new NotFoundError("Bill not found");
          const billRow = bills[0]!;

          if (activeBillTestHook) {
            await activeBillTestHook('after_bill_lock', { billRow, stage: 'issue' });
          }

          let existingBill: any = null;
          let existingMovement: any = null;
          let existingPayment: any = null;

          if (options?.idempotencyKey) {
            [existingBill, existingMovement, existingPayment] = await Promise.all([
              tx.bill.findUnique({ where: { idempotencyKey: options.idempotencyKey } }),
              tx.stockMovement.findFirst({
                where: {
                  OR: [
                    { idempotencyKey: options.idempotencyKey },
                    { idempotencyKey: { startsWith: `${options.idempotencyKey}:` } }
                  ]
                }
              }),
              tx.payment.findUnique({ where: { idempotencyKey: options.idempotencyKey } })
            ]);

            if (existingBill && existingBill.id !== id) {
              throw new ConflictError("Idempotency key already used for another bill.");
            }
            if (existingMovement && existingMovement.billId !== id) {
              throw new ConflictError("Idempotency key already used for another bill or operation.");
            }
            if (existingPayment) {
              throw new ConflictError("Idempotency key already used for another operation.");
            }
          }

          // Idempotent return if already issued
          if (billRow.status === BillStatus.ISSUED) {
            const currentBill = await tx.bill.findUnique({
              where: { id },
              include: { lines: true, customer: true, location: true, estimate: { select: { id: true, estimateNumber: true } } }
            });
            if (!currentBill) throw new NotFoundError("Bill not found");

            if (options?.idempotencyKey) {
              if (existingMovement) {
                if (options.locationId && options.locationId !== existingMovement.locationId) {
                  throw new ConflictError(
                    `Idempotency key already used with different parameters (locationId). Expected ${existingMovement.locationId}, got ${options.locationId}.`
                  );
                }
              } else {
                const movementsForBill = await tx.stockMovement.findFirst({
                  where: { billId: id, type: MovementType.ISSUE }
                });
                if (movementsForBill) {
                  throw new ConflictError("Only draft bills can be issued. Current status: ISSUED.");
                } else if (options.locationId && currentBill.locationId && options.locationId !== currentBill.locationId) {
                  throw new ConflictError(
                    `Idempotency key already used with different parameters (locationId). Expected ${currentBill.locationId}, got ${options.locationId}.`
                  );
                }
              }
            }

            return this.toSafeBill(currentBill);
          }

          if (billRow.status !== BillStatus.DRAFT) {
            throw new ConflictError(`Only draft bills can be issued. Current status: ${billRow.status}.`);
          }

          // 2. Resolve location
          let targetLocationId = options?.locationId || billRow.locationId;
          let location;
          if (targetLocationId) {
            location = await tx.inventoryLocation.findUnique({ where: { id: targetLocationId } });
            if (!location || !location.isActive) {
              throw new ValidationError("Invalid or inactive inventory location.");
            }
          } else {
            location = await tx.inventoryLocation.findFirst({ where: { isDefault: true, isActive: true } });
            if (!location) {
              throw new ValidationError("No valid inventory location specified or configured.");
            }
            targetLocationId = location.id;
          }

          // 3. Fetch bill and lines
          const bill = await tx.bill.findUnique({
            where: { id },
            include: { lines: true }
          });
          if (!bill) throw new NotFoundError("Bill not found");

          const inventoryLines = bill.lines.filter(
            l => l.variantId != null && new Prisma.Decimal(l.quantity.toString()).gt(0)
          );

          if (activeBillTestHook) {
            await activeBillTestHook('before_stock_deduction', { bill });
          }

          // 4. Deduct inventory if inventory lines exist
          if (inventoryLines.length > 0) {
            await InventoryService.deductMultipleStock(
              {
                locationId: targetLocationId,
                items: inventoryLines.map(l => ({
                  variantId: l.variantId!,
                  quantity: l.quantity
                })),
                reference: bill.billNumber,
                reason: options?.reason || `Bill issuance #${bill.billNumber}`,
                userId: options?.userId,
                idempotencyKey: deductKey,
                billId: bill.id
              },
              tx
            );
          }

          if (activeBillTestHook) {
            await activeBillTestHook('after_stock_deduction', { bill });
          }

          // 5. Update bill status to ISSUED and persist locationId
          const updatedBill = await tx.bill.update({
            where: { id },
            data: {
              status: BillStatus.ISSUED,
              locationId: targetLocationId
            },
            include: {
              lines: true,
              customer: true,
              location: true,
              estimate: { select: { id: true, estimateNumber: true } }
            }
          });

          if (activeBillTestHook) {
            await activeBillTestHook('after_bill_status_update', { updatedBill });
          }

          return this.toSafeBill(updatedBill);
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          const check = await prisma.bill.findUnique({
            where: { id },
            include: { lines: true, customer: true, location: true, estimate: { select: { id: true, estimateNumber: true } } }
          });
          if (check && check.status === BillStatus.ISSUED) {
            return this.toSafeBill(check);
          }
        }

        if (attempts < maxAttempts && isRetryableDbError(err)) {
          await new Promise(r => setTimeout(r, 20 * Math.pow(2, attempts) + Math.random() * 20));
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError("Transaction conflict: maximum retry attempts exceeded during bill issuance.");
  }

  static async cancelBill(
    id: string,
    options?: {
      userId?: string;
      idempotencyKey?: string;
      reason?: string | null;
    }
  ): Promise<SafeBill> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await prisma.$transaction(async (tx) => {
          // 1. Level 7 Lock: Bill row FOR UPDATE
          const bills: Array<{ id: string; status: BillStatus; locationId: string | null; amountPaid: Prisma.Decimal }> = await tx.$queryRaw`
            SELECT id, status, "locationId", "amountPaid" FROM "Bill" WHERE id = ${id} FOR UPDATE
          `;
          if (bills.length === 0) throw new NotFoundError("Bill not found");
          const billRow = bills[0]!;

          if (activeBillTestHook) {
            await activeBillTestHook('after_bill_lock', { billRow, stage: 'cancel' });
          }

          let existingBill: any = null;
          let existingMovement: any = null;
          let existingPayment: any = null;

          if (options?.idempotencyKey) {
            [existingBill, existingMovement, existingPayment] = await Promise.all([
              tx.bill.findUnique({ where: { idempotencyKey: options.idempotencyKey } }),
              tx.stockMovement.findFirst({
                where: {
                  OR: [
                    { idempotencyKey: options.idempotencyKey },
                    { idempotencyKey: { startsWith: `${options.idempotencyKey}:` } }
                  ]
                }
              }),
              tx.payment.findUnique({ where: { idempotencyKey: options.idempotencyKey } })
            ]);

            if (existingBill && existingBill.id !== id) {
              throw new ConflictError("Idempotency key already used for another bill.");
            }
            if (existingMovement && existingMovement.billId !== id) {
              throw new ConflictError("Idempotency key already used for another bill or operation.");
            }
            if (existingPayment) {
              throw new ConflictError("Idempotency key already used for another operation.");
            }
          }

          // Idempotent return if already cancelled
          if (billRow.status === BillStatus.CANCELLED) {
            const currentBill = await tx.bill.findUnique({
              where: { id },
              include: { lines: true, customer: true, location: true, estimate: { select: { id: true, estimateNumber: true } } }
            });
            if (!currentBill) throw new NotFoundError("Bill not found");

            if (options?.idempotencyKey) {
              if (existingMovement) {
                if (options.reason && existingMovement.reason && options.reason.trim() !== existingMovement.reason.trim()) {
                  const defaultReason = `Bill cancellation #${currentBill.billNumber}`;
                  if (existingMovement.reason !== defaultReason && existingMovement.reason !== options.reason.trim()) {
                    throw new ConflictError("Idempotency key already used with different parameters (reason).");
                  }
                }
              } else {
                const cancelMovementsForBill = await tx.stockMovement.findFirst({
                  where: { billId: id, type: MovementType.POSITIVE_ADJUSTMENT }
                });
                if (cancelMovementsForBill) {
                  throw new ConflictError("Cannot cancel bill in status CANCELLED.");
                }
              }
            }

            return this.toSafeBill(currentBill);
          }

          // Payment check: Bills with payments cannot be cancelled
          const paymentCount = await tx.payment.count({ where: { billId: id } });
          if (new Prisma.Decimal(billRow.amountPaid.toString()).gt(0) || paymentCount > 0) {
            throw new ConflictError("Cannot cancel a bill that has recorded payments.");
          }

          if (billRow.status === BillStatus.PAID || billRow.status === BillStatus.PARTIALLY_PAID) {
            throw new ConflictError("Cannot cancel a paid or partially paid bill.");
          }

          // Bill must be DRAFT or ISSUED
          if (billRow.status !== BillStatus.DRAFT && billRow.status !== BillStatus.ISSUED) {
            throw new ConflictError(`Cannot cancel bill in status ${billRow.status}.`);
          }

          const bill = await tx.bill.findUnique({
            where: { id },
            include: { lines: true }
          });
          if (!bill) throw new NotFoundError("Bill not found");

          // If bill was DRAFT, no stock was ever deducted. Just transition to CANCELLED.
          if (billRow.status === BillStatus.DRAFT) {
            const updatedBill = await tx.bill.update({
              where: { id },
              data: {
                status: BillStatus.CANCELLED,
                ...(options?.idempotencyKey && !bill.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {})
              },
              include: {
                lines: true,
                customer: true,
                location: true,
                estimate: { select: { id: true, estimateNumber: true } }
              }
            });
            return this.toSafeBill(updatedBill);
          }

          // For ISSUED bill: Restore inventory based on committed stock movements
          const issueMovements = await tx.stockMovement.findMany({
            where: {
              billId: id,
              type: MovementType.ISSUE
            }
          });

          const inventoryLines = bill.lines.filter(
            l => l.variantId != null && new Prisma.Decimal(l.quantity.toString()).gt(0)
          );

          if (inventoryLines.length > 0 && issueMovements.length === 0) {
            throw new ConflictError("Cannot cancel issued bill: missing original stock deduction movements.");
          }

          if (issueMovements.length > 0) {
            // Aggregate restoration quantities by locationId:variantId
            const restorations = new Map<string, { variantId: string; locationId: string; quantity: Prisma.Decimal }>();
            for (const m of issueMovements) {
              const key = `${m.locationId}:${m.variantId}`;
              const current = restorations.get(key);
              const qty = new Prisma.Decimal(m.quantity.toString());
              if (current) {
                current.quantity = current.quantity.add(qty);
              } else {
                restorations.set(key, { variantId: m.variantId, locationId: m.locationId, quantity: qty });
              }
            }

            if (activeBillTestHook) {
              await activeBillTestHook('before_cancellation_restore', { bill, restorations });
            }

            // Level 8 Lock: Sort variant IDs deterministically to lock balances
            const sortedVariantIds = Array.from(
              new Set(Array.from(restorations.values()).map(r => r.variantId))
            ).sort((a, b) => a.localeCompare(b));

            const lockedBalances = await tx.$queryRaw<Array<{
              id: string;
              variantId: string;
              locationId: string;
              quantity: Prisma.Decimal;
              reserved: Prisma.Decimal;
            }>>`
              SELECT id, "variantId", "locationId", quantity, reserved
              FROM "InventoryBalance"
              WHERE "variantId" IN (${Prisma.join(sortedVariantIds)})
              ORDER BY id ASC
              FOR UPDATE
            `;

            const balanceKeyMap = new Map(
              lockedBalances.map(b => [`${b.locationId}:${b.variantId}`, b])
            );

            if (options?.idempotencyKey) {
              const expectedCancelKeys = restorations.size === 1
                ? [options.idempotencyKey]
                : Array.from(restorations.values()).map(r => `${options.idempotencyKey}:${r.variantId}`);
              const existingKeyMovement = await tx.stockMovement.findFirst({
                where: { idempotencyKey: { in: expectedCancelKeys } }
              });
              if (existingKeyMovement && existingKeyMovement.billId !== id) {
                throw new ConflictError(`Idempotency key '${options.idempotencyKey}' already used for another bill cancellation.`);
              }
            }

            // Update balances
            for (const [key, rest] of restorations.entries()) {
              const existingBal = balanceKeyMap.get(key);
              if (existingBal) {
                await tx.inventoryBalance.update({
                  where: { id: existingBal.id },
                  data: {
                    quantity: { increment: rest.quantity }
                  }
                });
              } else {
                await tx.inventoryBalance.create({
                  data: {
                    variantId: rest.variantId,
                    locationId: rest.locationId,
                    quantity: rest.quantity,
                    reserved: 0
                  }
                });
              }
            }

            if (activeBillTestHook) {
              await activeBillTestHook('after_balance_restore', { bill, restorations });
            }

            // Record POSITIVE_ADJUSTMENT movements
            for (const [key, rest] of restorations.entries()) {
              const itemKey = options?.idempotencyKey
                ? (restorations.size === 1 ? options.idempotencyKey : `${options.idempotencyKey}:${rest.variantId}`)
                : `bill-cancel:${id}:${rest.variantId}`;

              // Level 9: Insert StockMovement
              await tx.stockMovement.create({
                data: {
                  variantId: rest.variantId,
                  locationId: rest.locationId,
                  userId: options?.userId ?? null,
                  billId: bill.id,
                  type: MovementType.POSITIVE_ADJUSTMENT,
                  quantity: rest.quantity,
                  reference: bill.billNumber,
                  reason: options?.reason || `Bill cancellation #${bill.billNumber}`,
                  idempotencyKey: itemKey
                }
              });
            }

            if (activeBillTestHook) {
              await activeBillTestHook('after_restoration_movement', { bill });
            }
          }

          // Update bill status to CANCELLED
          const cancelledBill = await tx.bill.update({
            where: { id },
            data: { status: BillStatus.CANCELLED },
            include: {
              lines: true,
              customer: true,
              location: true,
              estimate: { select: { id: true, estimateNumber: true } }
            }
          });

          if (activeBillTestHook) {
            await activeBillTestHook('after_bill_status_update', { cancelledBill });
          }

          return this.toSafeBill(cancelledBill);
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          const check = await prisma.bill.findUnique({
            where: { id },
            include: { lines: true, customer: true, location: true, estimate: { select: { id: true, estimateNumber: true } } }
          });
          if (check && check.status === BillStatus.CANCELLED) {
            return this.toSafeBill(check);
          }
        }

        if (attempts < maxAttempts && isRetryableDbError(err)) {
          await new Promise(r => setTimeout(r, 20 * Math.pow(2, attempts) + Math.random() * 20));
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError("Transaction conflict: maximum retry attempts exceeded during bill cancellation.");
  }

  static async updateStatus(
    id: string,
    status: BillStatus,
    options?: {
      userId?: string;
      locationId?: string | null;
      idempotencyKey?: string;
      reason?: string | null;
    }
  ): Promise<SafeBill> {
    if (status === BillStatus.ISSUED) {
      return this.issueBill(id, options);
    }

    if (status === BillStatus.CANCELLED) {
      return this.cancelBill(id, options);
    }

    if (status === BillStatus.PARTIALLY_PAID || status === BillStatus.PAID) {
      throw new ValidationError(
        "Cannot manually transition bill status to PARTIALLY_PAID or PAID. These statuses are managed by payments."
      );
    }

    if (status === BillStatus.DRAFT) {
      const bill = await prisma.bill.findUnique({ where: { id } });
      if (!bill) throw new NotFoundError("Bill not found");
      if (bill.status !== BillStatus.DRAFT) {
        throw new ConflictError("Cannot revert a non-draft bill to DRAFT status.");
      }
      return this.getBill(id);
    }

    throw new ValidationError(`Unsupported bill status transition to ${status}.`);
  }

  static async getBill(id: string, options?: { includeProfit?: boolean }): Promise<SafeBill> {
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        lines: {
          include: { variant: true },
          orderBy: { sortOrder: 'asc' }
        },
        customer: true,
        location: true,
        estimate: { select: { id: true, estimateNumber: true } }
      }
    });
    if (!bill) throw new NotFoundError("Bill not found");
    return this.toSafeBill(bill, options);
  }

  static async getBills(
    page = 1,
    limit = 50,
    filters?: { customerId?: string, status?: BillStatus },
    options?: { includeProfit?: boolean }
  ): Promise<{ items: SafeBill[], total: number }> {
    const where: any = {};
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.status) where.status = filters.status;
    
    const [items, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: {
          lines: {
            include: { variant: true },
            orderBy: { sortOrder: 'asc' }
          },
          customer: true,
          location: true,
          estimate: { select: { id: true, estimateNumber: true } }
        }
      }),
      prisma.bill.count({ where })
    ]);
    return { items: items.map(b => this.toSafeBill(b, options)), total };
  }

  private static async prepareLines(lines: any[], tx: any = prisma) {
    const calculatedLines = [];
    for (const line of lines) {
      if (line.variantId) {
        const variant = await tx.productVariant.findUnique({ 
          where: { id: line.variantId },
          include: { product: true }
        });
        if (!variant || !variant.isActive || !variant.product.isActive) {
          throw new ValidationError(`Variant ${line.variantId} is invalid or inactive.`);
        }
      }
      
      const calc = BillingCalculationService.calculateLine({
        quantity: line.quantity,
        unitRate: line.unitRate,
        discountAmount: line.discountAmount,
        taxRate: line.taxRate
      });
      calculatedLines.push({ input: line, calc });
    }
    return calculatedLines;
  }

  static toSafeBill(bill: any, options?: { includeProfit?: boolean }): SafeBill {
    const { createdAt, updatedAt, subtotal, discountTotal, taxTotal, grandTotal, amountPaid, balanceDue, lines, customer, estimate, location, ...safe } = bill;

    let billProfit: SafeBillProfit | undefined = undefined;

    let safeLines: SafeBillLine[] | undefined = undefined;
    if (lines) {
      let totalBillCost = new Prisma.Decimal(0);
      let totalBillRevenue = new Prisma.Decimal(0);

      safeLines = lines.map((l: any) => {
        const { quantity, unitRate, discountAmount, taxRate, taxAmount, subtotal: lSub, lineAmount, variant, ...safeLine } = l;

        let lineProfitObj: SafeBillLineProfit | undefined = undefined;

        if (options?.includeProfit) {
          const lineQty = new Prisma.Decimal(quantity.toString());
          const lineSubtotal = new Prisma.Decimal(lSub.toString());
          const lineDisc = new Prisma.Decimal(discountAmount ? discountAmount.toString() : '0');
          const lineRevenue = lineSubtotal.sub(lineDisc);

          const rawCost = variant?.costPrice ?? l.costPrice ?? null;
          const unitCost = rawCost !== null && rawCost !== undefined ? new Prisma.Decimal(rawCost.toString()) : new Prisma.Decimal(0);
          const totalCost = unitCost.mul(lineQty);
          const grossProfit = lineRevenue.sub(totalCost);
          const marginPercentage = lineRevenue.gt(0)
            ? (grossProfit.div(lineRevenue).mul(100)).toFixed(2)
            : '0.00';

          lineProfitObj = {
            unitCost: unitCost.toFixed(2),
            totalCost: totalCost.toFixed(2),
            grossProfit: grossProfit.toFixed(2),
            marginPercentage
          };

          totalBillCost = totalBillCost.add(totalCost);
          totalBillRevenue = totalBillRevenue.add(lineRevenue);
        }

        return {
          ...safeLine,
          quantity: quantity ? quantity.toString() : '0',
          unitRate: unitRate ? unitRate.toString() : '0',
          discountAmount: discountAmount ? discountAmount.toString() : '0',
          taxRate: taxRate ? taxRate.toString() : '0',
          taxAmount: taxAmount ? taxAmount.toString() : '0',
          subtotal: lSub ? lSub.toString() : '0',
          lineAmount: lineAmount ? lineAmount.toString() : (lSub ? lSub.toString() : '0'),
          ...(lineProfitObj && { profit: lineProfitObj })
        };
      });

      if (options?.includeProfit) {
        const billSub = new Prisma.Decimal(subtotal.toString());
        const billDisc = new Prisma.Decimal(discountTotal ? discountTotal.toString() : '0');
        const billRevenue = billSub.sub(billDisc);
        const billGrossProfit = billRevenue.sub(totalBillCost);
        const billMarginPct = billRevenue.gt(0)
          ? (billGrossProfit.div(billRevenue).mul(100)).toFixed(2)
          : '0.00';

        billProfit = {
          totalCost: totalBillCost.toFixed(2),
          totalRevenue: billRevenue.toFixed(2),
          grossProfit: billGrossProfit.toFixed(2),
          marginPercentage: billMarginPct
        };
      }
    }

    return {
      ...safe,
      subtotal: subtotal.toString(),
      discountTotal: discountTotal.toString(),
      taxTotal: taxTotal.toString(),
      grandTotal: grandTotal.toString(),
      amountPaid: amountPaid.toString(),
      balanceDue: balanceDue.toString(),
      ...(safeLines && { lines: safeLines }),
      ...(customer && { customer: CustomerService.toSafeCustomer(customer) }),
      ...(location && { location: toSafeLocation(location) }),
      ...(estimate && {
        estimate: {
          id: estimate.id,
          estimateNumber: estimate.estimateNumber
        }
      }),
      ...(billProfit && { profit: billProfit })
    };
  }
}
