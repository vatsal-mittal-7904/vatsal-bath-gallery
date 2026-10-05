/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { prisma } from '@/lib/db/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { EstimateStatus, Prisma } from '@prisma/client';
import { SafeEstimate, SafeEstimateLine } from './billing.types';
import { BillingCalculationService, LineInput, LineOutput } from './billing-calculation.service';
import { DocumentSequenceService } from './document-sequence.service';
import { CustomerService } from './customer.service';

export type EstimateUpdateTestHook = (stage: string) => Promise<void>;
let activeEstimateUpdateTestHook: EstimateUpdateTestHook | null = null;

export function __setEstimateUpdateTestHook(hook: EstimateUpdateTestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activeEstimateUpdateTestHook = hook;
  }
}

export const ALLOWED_ESTIMATE_STATUS_TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  [EstimateStatus.DRAFT]: [EstimateStatus.DRAFT, EstimateStatus.SENT],
  [EstimateStatus.SENT]: [EstimateStatus.SENT, EstimateStatus.ACCEPTED, EstimateStatus.REJECTED, EstimateStatus.EXPIRED],
  [EstimateStatus.ACCEPTED]: [EstimateStatus.ACCEPTED],
  [EstimateStatus.REJECTED]: [EstimateStatus.REJECTED],
  [EstimateStatus.EXPIRED]: [EstimateStatus.EXPIRED],
  [EstimateStatus.CONVERTED]: [EstimateStatus.CONVERTED],
};

export class EstimateService {
  
  static validateStatusTransition(currentStatus: EstimateStatus, targetStatus: EstimateStatus): void {
    if (currentStatus === EstimateStatus.CONVERTED) {
      throw new ConflictError("Cannot alter status of a converted estimate.");
    }

    if (targetStatus === currentStatus) {
      return;
    }

    if (targetStatus === EstimateStatus.CONVERTED) {
      throw new ValidationError("Cannot manually set status to CONVERTED; use the bill conversion workflow.");
    }

    const allowed = ALLOWED_ESTIMATE_STATUS_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new ValidationError(`Invalid estimate status transition from ${currentStatus} to ${targetStatus}.`);
    }
  }
  
  static isEquivalentEstimatePayload(
    existing: {
      customerId?: string | null;
      parchaJobId?: string | null;
      notes?: string | null;
      terms?: string | null;
      lines: Array<{
        parchaRowId?: string | null;
        variantId?: string | null;
        productSnapshot: string;
        variantSnapshot?: string | null;
        skuSnapshot?: string | null;
        quantity: Prisma.Decimal | string | number;
        unitOfMeasure?: string | null;
        unitRate: Prisma.Decimal | string | number;
        discountAmount: Prisma.Decimal | string | number;
        taxRate: Prisma.Decimal | string | number;
      }>;
    },
    requested: {
      customerId?: string | null;
      parchaJobId?: string | null;
      notes?: string | null;
      terms?: string | null;
      lines: Array<{
        parchaRowId?: string | null;
        variantId?: string | null;
        productSnapshot: string;
        variantSnapshot?: string | null;
        skuSnapshot?: string | null;
        quantity: string;
        unitOfMeasure?: string | null;
        unitRate: string;
        discountAmount?: string;
        taxRate?: string;
      }>;
    }
  ): boolean {
    if ((existing.customerId || null) !== (requested.customerId || null)) return false;
    if ((existing.parchaJobId || null) !== (requested.parchaJobId || null)) return false;
    if ((existing.notes || null) !== (requested.notes || null)) return false;
    if ((existing.terms || null) !== (requested.terms || null)) return false;
    if (existing.lines.length !== requested.lines.length) return false;

    for (let i = 0; i < existing.lines.length; i++) {
      const el = existing.lines[i];
      const rl = requested.lines[i];
      if (!el || !rl) return false;

      if ((el.parchaRowId || null) !== (rl.parchaRowId || null)) return false;
      if ((el.variantId || null) !== (rl.variantId || null)) return false;
      if ((el.productSnapshot || '').trim() !== (rl.productSnapshot || '').trim()) return false;
      if ((el.variantSnapshot || null) !== (rl.variantSnapshot || null)) return false;
      if ((el.skuSnapshot || null) !== (rl.skuSnapshot || null)) return false;
      if ((el.unitOfMeasure || null) !== (rl.unitOfMeasure || null)) return false;

      try {
        const eqQty = new Prisma.Decimal(el.quantity).equals(new Prisma.Decimal(rl.quantity));
        const eqRate = new Prisma.Decimal(el.unitRate).equals(new Prisma.Decimal(rl.unitRate));
        const eqDisc = new Prisma.Decimal(el.discountAmount).equals(new Prisma.Decimal(rl.discountAmount || 0));
        const eqTax = new Prisma.Decimal(el.taxRate).equals(new Prisma.Decimal(rl.taxRate || 0));
        if (!eqQty || !eqRate || !eqDisc || !eqTax) return false;
      } catch {
        return false;
      }
    }

    return true;
  }

  static async createEstimate(data: {
    customerId?: string | null,
    issueDate: Date,
    validityDate?: Date | null,
    notes?: string | null,
    terms?: string | null,
    idempotencyKey?: string,
    creatorId?: string,
    parchaJobId?: string | null,
    lines: Array<{
      variantId?: string | null,
      productSnapshot: string,
      variantSnapshot?: string | null,
      skuSnapshot?: string | null,
      quantity: string,
      unitOfMeasure?: string | null,
      unitRate: string,
      discountAmount: string,
      taxRate: string,
      parchaRowId?: string | null
    }>
  }, txArg?: Prisma.TransactionClient): Promise<SafeEstimate> {
    
    const execute = async (tx: Prisma.TransactionClient) => {
      if (data.idempotencyKey) {
        const existing = await tx.estimate.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true }
        });
        if (existing) {
          const isEquivalent = this.isEquivalentEstimatePayload(existing, {
            customerId: data.customerId,
            parchaJobId: data.parchaJobId,
            notes: data.notes,
            terms: data.terms,
            lines: data.lines
          });
          if (!isEquivalent) {
            throw new ConflictError("Idempotency key already used for a different estimate payload");
          }
          return this.toSafeEstimate(existing);
        }
      }

    if (data.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
      if (!customer?.isActive) throw new ValidationError("Invalid or inactive customer.");
    }

    // Verify variants and compute lines using transaction client
    const calculatedLines = await this.prepareLines(data.lines, tx);
    const totals = BillingCalculationService.calculateTotals(calculatedLines.map(l => l.calc));

    const estimateNumber = await DocumentSequenceService.getNextEstimateNumber(tx);

    const estimate = await tx.estimate.create({
      data: {
        estimateNumber,
        customerId: data.customerId,
        parchaJobId: data.parchaJobId || null,
        issueDate: data.issueDate,
        validityDate: data.validityDate,
        status: EstimateStatus.DRAFT,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        notes: data.notes,
        terms: data.terms,
        creatorId: data.creatorId,
        idempotencyKey: data.idempotencyKey,
        lines: {
          create: calculatedLines.map((l, i) => ({
            variantId: l.input.variantId,
            parchaRowId: l.input.parchaRowId || null,
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
      include: { lines: true, customer: true }
    });

    return this.toSafeEstimate(estimate);
    };

    if (txArg) {
      return await execute(txArg);
    }
    return await prisma.$transaction(execute);
  }

  static async updateEstimate(id: string, data: {
    version: number,
    customerId?: string | null,
    issueDate?: Date,
    validityDate?: Date | null,
    notes?: string | null,
    terms?: string | null,
    status?: EstimateStatus,
    lines?: Array<{
      id?: string | null,
      variantId?: string | null,
      productSnapshot: string,
      variantSnapshot?: string | null,
      skuSnapshot?: string | null,
      quantity: string,
      unitOfMeasure?: string | null,
      unitRate: string,
      discountAmount?: string,
      taxRate?: string,
      parchaRowId?: string | null,
      sortOrder?: number
    }>
  }): Promise<SafeEstimate> {
    if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 0) {
      throw new ValidationError("Valid non-negative integer version is required");
    }
    
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.estimate.findUnique({ 
        where: { id }, 
        include: { 
          lines: { orderBy: { sortOrder: 'asc' } },
          customer: true,
          parchaJob: true
        } 
      });
      if (!existing) throw new NotFoundError("Estimate not found");
      if (existing.status === EstimateStatus.CONVERTED) {
        throw new ConflictError("Cannot edit a converted estimate.");
      }

      // Optimistic concurrency check
      if (existing.version !== data.version) {
        throw new ConflictError("Estimate was modified by another user or session. Please reload to see the latest version.");
      }

      // Status transition validation
      if (data.status !== undefined) {
        this.validateStatusTransition(existing.status, data.status);
      }

      if (process.env.NODE_ENV === 'test' && activeEstimateUpdateTestHook) {
        await activeEstimateUpdateTestHook('after-version-check');
      }

      // Level 5 FOR SHARE lock on Customer if customerId provided
      if (data.customerId !== undefined) {
        if (data.customerId) {
          const customerRows = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
            SELECT id, "isActive" FROM "Customer"
            WHERE id = ${data.customerId}
            FOR SHARE
          `;
          const customer = Array.isArray(customerRows) && customerRows.length > 0 ? customerRows[0] : null;
          if (!customer || !customer.isActive) {
            throw new ValidationError("Selected customer is invalid or inactive");
          }
        }
      }

      if (process.env.NODE_ENV === 'test' && activeEstimateUpdateTestHook) {
        await activeEstimateUpdateTestHook('after-customer-lock');
      }
      
      let newTotals = {
        subtotal: existing.subtotal,
        discountTotal: existing.discountTotal,
        taxTotal: existing.taxTotal,
        grandTotal: existing.grandTotal
      };
      
      let updatedLinesData: any[] = [];
      let updateLines = false;

      if (data.lines !== undefined) {
        updateLines = true;
        if (data.lines.length === 0) {
          throw new ValidationError("Estimate must have at least one line item");
        }

        // Map existing lines by parchaRowId to enforce immutability of parcha-confirmed product & variant
        const existingParchaRowMap = new Map<string, typeof existing.lines[0]>();
        for (const exLine of existing.lines) {
          if (exLine.parchaRowId) {
            existingParchaRowMap.set(exLine.parchaRowId, exLine);
          }
        }

        // Check for duplicate parchaRowId and immutability of parcha-confirmed lines
        const seenParchaRows = new Set<string>();
        for (const line of data.lines) {
          if (line.parchaRowId) {
            if (seenParchaRows.has(line.parchaRowId)) {
              throw new ValidationError(`Duplicate source row reference for parchaRowId: ${line.parchaRowId}`);
            }
            seenParchaRows.add(line.parchaRowId);

            const originalLine = existingParchaRowMap.get(line.parchaRowId);
            if (!originalLine) {
              throw new ValidationError(`Cannot attach unconfirmed or external parchaRowId to existing estimate`);
            }

            if (line.variantId !== undefined && (line.variantId || null) !== (originalLine.variantId || null)) {
              throw new ValidationError(`Cannot modify product or variant of a parcha-confirmed line`);
            }
            if (line.productSnapshot && line.productSnapshot.trim() !== originalLine.productSnapshot.trim()) {
              throw new ValidationError(`Cannot modify product or variant of a parcha-confirmed line`);
            }
          }
        }

        const calculatedLines = await this.prepareLines(
          data.lines.map(l => ({
            variantId: l.variantId,
            productSnapshot: l.productSnapshot,
            variantSnapshot: l.variantSnapshot,
            skuSnapshot: l.skuSnapshot,
            quantity: l.quantity,
            unitOfMeasure: l.unitOfMeasure,
            unitRate: l.unitRate,
            discountAmount: l.discountAmount || '0',
            taxRate: l.taxRate || '0',
            parchaRowId: l.parchaRowId || null
          })), 
          tx
        );
        newTotals = BillingCalculationService.calculateTotals(calculatedLines.map(l => l.calc));
        
        updatedLinesData = calculatedLines.map((l, i) => ({
          variantId: l.input.variantId || null,
          parchaRowId: l.input.parchaRowId || null,
          productSnapshot: l.input.productSnapshot,
          variantSnapshot: l.input.variantSnapshot || null,
          skuSnapshot: l.input.skuSnapshot || null,
          quantity: l.calc.quantity,
          unitOfMeasure: l.input.unitOfMeasure || null,
          unitRate: l.calc.unitRate,
          discountAmount: l.calc.discountAmount,
          taxRate: l.calc.taxRate,
          taxAmount: l.calc.taxAmount,
          subtotal: l.calc.subtotal,
          lineAmount: l.calc.lineAmount,
          sortOrder: i
        }));
      }

      if (updateLines) {
        await tx.estimateLine.deleteMany({ where: { estimateId: id } });
      }

      const updateResult = await tx.estimate.updateMany({
        where: { 
          id,
          version: data.version
        },
        data: {
          customerId: data.customerId !== undefined ? data.customerId : undefined,
          issueDate: data.issueDate !== undefined ? data.issueDate : undefined,
          validityDate: data.validityDate !== undefined ? data.validityDate : undefined,
          notes: data.notes !== undefined ? data.notes : undefined,
          terms: data.terms !== undefined ? data.terms : undefined,
          status: data.status !== undefined ? data.status : undefined,
          subtotal: newTotals.subtotal,
          discountTotal: newTotals.discountTotal,
          taxTotal: newTotals.taxTotal,
          grandTotal: newTotals.grandTotal,
          version: { increment: 1 }
        }
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Estimate was modified concurrently. Please reload to see the latest version.");
      }

      if (updateLines && updatedLinesData.length > 0) {
        await tx.estimateLine.createMany({
          data: updatedLinesData.map(line => ({
            ...line,
            estimateId: id
          }))
        });
      }

      const updated = await tx.estimate.findUnique({
        where: { id },
        include: { 
          lines: { orderBy: { sortOrder: 'asc' } }, 
          customer: true,
          parchaJob: {
            select: { id: true, originalFilename: true, status: true, uploaderId: true }
          }
        }
      });
      return this.toSafeEstimate(updated!);
    });
  }
  
  static async updateStatus(id: string, status: EstimateStatus, version: number): Promise<SafeEstimate> {
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      throw new ValidationError("Valid non-negative integer version is required");
    }

    return await prisma.$transaction(async (tx) => {
      const estimate = await tx.estimate.findUnique({ 
        where: { id },
        include: { 
          lines: { orderBy: { sortOrder: 'asc' } }, 
          customer: true,
          parchaJob: {
            select: { id: true, originalFilename: true, status: true, uploaderId: true }
          }
        } 
      });
      if (!estimate) throw new NotFoundError("Estimate not found");
      if (estimate.status === EstimateStatus.CONVERTED) {
        throw new ConflictError("Cannot alter status of a converted estimate.");
      }

      if (estimate.version !== version) {
        throw new ConflictError("Estimate was modified by another user or session. Please reload to see the latest version.");
      }

      this.validateStatusTransition(estimate.status, status);

      const updateResult = await tx.estimate.updateMany({
        where: { id, version },
        data: { 
          status,
          version: { increment: 1 }
        }
      });

      if (updateResult.count === 0) {
        throw new ConflictError("Estimate was modified concurrently. Please reload to see the latest version.");
      }

      const updated = await tx.estimate.findUnique({
        where: { id },
        include: { 
          lines: { orderBy: { sortOrder: 'asc' } }, 
          customer: true,
          parchaJob: {
            select: { id: true, originalFilename: true, status: true, uploaderId: true }
          }
        } 
      });
      return this.toSafeEstimate(updated!);
    });
  }

  static async getEstimate(id: string): Promise<SafeEstimate> {
    const estimate = await prisma.estimate.findUnique({ 
      where: { id }, 
      include: { 
        lines: { orderBy: { sortOrder: 'asc' } }, 
        customer: true,
        parchaJob: {
          select: { id: true, originalFilename: true, status: true, uploaderId: true }
        }
      } 
    });
    if (!estimate) throw new NotFoundError("Estimate not found");
    return this.toSafeEstimate(estimate);
  }

  static async getEstimates(page = 1, limit = 50, filters?: { customerId?: string, status?: EstimateStatus }): Promise<{ items: SafeEstimate[], total: number }> {
    const where: any = {};
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.status) where.status = filters.status;
    
    const [items, total] = await Promise.all([
      prisma.estimate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: { 
          customer: true,
          parchaJob: {
            select: { id: true, originalFilename: true, status: true, uploaderId: true }
          }
        }
      }),
      prisma.estimate.count({ where })
    ]);
    return { items: items.map(this.toSafeEstimate), total };
  }

  private static async prepareLines(
    lines: Array<{
      variantId?: string | null;
      productSnapshot: string;
      variantSnapshot?: string | null;
      skuSnapshot?: string | null;
      quantity: string;
      unitOfMeasure?: string | null;
      unitRate: string;
      discountAmount: string;
      taxRate: string;
      parchaRowId?: string | null;
    }>,
    tx: Prisma.TransactionClient
  ) {
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
      
      try {
        const calc = BillingCalculationService.calculateLine({
          quantity: line.quantity,
          unitRate: line.unitRate,
          discountAmount: line.discountAmount,
          taxRate: line.taxRate
        });
        calculatedLines.push({ input: line, calc });
      } catch (err: any) {
        if (err instanceof ValidationError) throw err;
        throw new ValidationError(err.message || 'Invalid line calculation.');
      }
    }
    return calculatedLines;
  }

  static toSafeEstimate(estimate: any): SafeEstimate {
    const { subtotal, discountTotal, taxTotal, grandTotal, lines, customer, parchaJob, ...safe } = estimate;
    return {
      ...safe,
      subtotal: subtotal.toString(),
      discountTotal: discountTotal.toString(),
      taxTotal: taxTotal.toString(),
      grandTotal: grandTotal.toString(),
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      version: estimate.version ?? 0,
      ...(parchaJob && {
        parchaJob: {
          id: parchaJob.id,
          originalFilename: parchaJob.originalFilename,
          status: parchaJob.status
        }
      }),
      ...(lines && {
        lines: lines.map((l: any) => {
          const { quantity, unitRate, discountAmount, taxRate, taxAmount, subtotal: lSub, lineAmount, ...safeLine } = l;
          return {
            ...safeLine,
            quantity: quantity.toString(),
            unitRate: unitRate.toString(),
            discountAmount: discountAmount.toString(),
            taxRate: taxRate.toString(),
            taxAmount: taxAmount.toString(),
            subtotal: lSub.toString(),
            lineAmount: lineAmount.toString()
          };
        })
      }),
      ...(customer && { customer: CustomerService.toSafeCustomer(customer) })
    };
  }
}
