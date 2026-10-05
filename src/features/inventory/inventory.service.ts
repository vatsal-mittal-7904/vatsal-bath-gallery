/* eslint-disable */
import { prisma } from '@/lib/db/client';
import { AppError, ConflictError, NotFoundError, ValidationError, InsufficientStockError, ValidationError as BadRequestError } from '@/lib/errors';
import { MovementType, TransferStatus, Prisma } from '@prisma/client';
import { toSafeBalance, toSafeMovement } from './inventory.utils';
import {
  StockAvailabilityResult,
  MultiStockAvailabilityResult,
  DeductStockInput,
  DeductMultipleStockInput,
  StockDeductionResult,
  MultiStockDeductionResult
} from './inventory.types';

export type InventoryTestHook = (stage: string, context?: any) => Promise<void>;
let activeInventoryTestHook: InventoryTestHook | null = null;

export function __setInventoryTestHook(hook: InventoryTestHook | null) {
  if (process.env.NODE_ENV === 'test') {
    activeInventoryTestHook = hook;
  }
}

export function isRetryableDbError(error: any): boolean {
  if (!error) return false;
  if (error.code === '40P01' || error.code === '40001') {
    return true;
  }
  if (error.code === 'P2034') {
    return true;
  }
  if (error.code === 'P2010') {
    const code = error.meta?.code;
    if (code === '40P01' || code === '40001') {
      return true;
    }
  }
  return false;
}

export class InventoryService {
  
  // LOCATIONS
  
  static async createLocation(data: { code: string, name: string, description?: string | null, isActive?: boolean, isDefault?: boolean }) {
    try {
      return await prisma.inventoryLocation.create({ data });
    } catch (err: any) {
      if (err.code === 'P2002') {
        if (err.meta?.target?.includes('isDefault') || err.message?.includes('isDefault') || err.message?.includes('InventoryLocation_isDefault_key')) {
          throw new ConflictError('A default location already exists.');
        }
        throw new ConflictError('A location with this code already exists.');
      }
      throw err;
    }
  }

  static async updateLocation(id: string, data: { name?: string, description?: string | null, isActive?: boolean, isDefault?: boolean, code?: string }) {
    try {
      return await prisma.inventoryLocation.update({ where: { id }, data });
    } catch (err: any) {
      if (err.code === 'P2025') throw new NotFoundError('Location not found');
      if (err.code === 'P2002') {
        if (err.meta?.target?.includes('isDefault') || err.message?.includes('isDefault') || err.message?.includes('InventoryLocation_isDefault_key')) {
          throw new ConflictError('A default location already exists.');
        }
        throw new ConflictError('Location code already in use.');
      }
      throw err;
    }
  }

  static async archiveLocation(id: string) {
    const balances = await prisma.inventoryBalance.findFirst({
      where: { locationId: id, quantity: { gt: 0 } }
    });
    if (balances) {
      throw new ConflictError('Cannot archive location with active stock balances.');
    }
    return await prisma.inventoryLocation.update({
      where: { id },
      data: { isActive: false }
    });
  }

  static async getLocations(page = 1, limit = 50, isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {};
    const [items, total] = await Promise.all([
      prisma.inventoryLocation.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' }
      }),
      prisma.inventoryLocation.count({ where })
    ]);
    return { items, total };
  }

  static async getLocation(id: string) {
    const loc = await prisma.inventoryLocation.findUnique({ where: { id } });
    if (!loc) throw new NotFoundError('Location not found');
    return loc;
  }

  // BALANCES

  static async getBalances(filters: { locationId?: string, variantId?: string }, page = 1, limit = 50) {
    const where = { ...filters };
    const [items, total] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where, skip: (page - 1) * limit, take: limit,
        include: { variant: { include: { product: true } }, location: true },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.inventoryBalance.count({ where })
    ]);
    return { items, total };
  }

  static async getBalance(variantId: string, locationId: string) {
    return await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      include: { variant: { include: { product: true } }, location: true }
    });
  }

  // STOCK OPERATIONS

  static async checkIdempotency(key?: string) {
    if (!key) return;
    const existing = await prisma.stockMovement.findUnique({ where: { idempotencyKey: key } });
    if (existing) throw new ConflictError('This operation has already been processed.');
  }

  static async recordOpeningStock(data: { variantId: string, locationId: string, quantity: number, reason: string, idempotencyKey?: string, userId?: string }) {
    await this.checkIdempotency(data.idempotencyKey);
    
    return await prisma.$transaction(async (tx) => {
      const loc = await tx.inventoryLocation.findUnique({ where: { id: data.locationId } });
      if (!loc?.isActive) throw new BadRequestError('Location is inactive or missing');
      
      const variant = await tx.productVariant.findUnique({ where: { id: data.variantId } });
      if (!variant?.isActive) throw new BadRequestError('Variant is inactive or missing');

      const existingBalance = await tx.inventoryBalance.findUnique({
        where: { variantId_locationId: { variantId: data.variantId, locationId: data.locationId } }
      });
      if (existingBalance) throw new ConflictError('Balance already initialized for this variant and location. Use adjustment or receipt.');

      const balance = await tx.inventoryBalance.create({
        data: { variantId: data.variantId, locationId: data.locationId, quantity: data.quantity }
      });

      const movement = await tx.stockMovement.create({
        data: {
          variantId: data.variantId, locationId: data.locationId,
          type: MovementType.OPENING_BALANCE, quantity: data.quantity,
          reason: data.reason, userId: data.userId, idempotencyKey: data.idempotencyKey
        }
      });
      return { balance, movement };
    });
  }

  static async receiveStock(data: { variantId: string, locationId: string, quantity: number, reference: string, reason?: string, idempotencyKey?: string, userId?: string }) {
    await this.checkIdempotency(data.idempotencyKey);

    return await prisma.$transaction(async (tx) => {
      const loc = await tx.inventoryLocation.findUnique({ where: { id: data.locationId } });
      if (!loc?.isActive) throw new BadRequestError('Location is inactive or missing');

      const balance = await tx.inventoryBalance.upsert({
        where: { variantId_locationId: { variantId: data.variantId, locationId: data.locationId } },
        create: { variantId: data.variantId, locationId: data.locationId, quantity: data.quantity },
        update: { quantity: { increment: data.quantity } }
      });

      const movement = await tx.stockMovement.create({
        data: {
          variantId: data.variantId, locationId: data.locationId,
          type: MovementType.RECEIPT, quantity: data.quantity,
          reference: data.reference, reason: data.reason,
          userId: data.userId, idempotencyKey: data.idempotencyKey
        }
      });
      return { balance, movement };
    });
  }

  // ==========================================
  // INVENTORY AVAILABILITY & DEDUCTION (Phase 6.4.2)
  // ==========================================

  static normalizeQuantity(quantity: number | string | Prisma.Decimal): Prisma.Decimal {
    if (quantity === undefined || quantity === null) {
      throw new ValidationError('Quantity is required');
    }
    let dec: Prisma.Decimal;
    try {
      dec = new Prisma.Decimal(quantity.toString());
    } catch {
      throw new ValidationError('Quantity must be a valid decimal number');
    }
    if (dec.isNaN() || !dec.isFinite()) {
      throw new ValidationError('Quantity must be a valid finite number');
    }
    if (dec.lte(0)) {
      throw new ValidationError('Quantity must be positive');
    }
    return dec;
  }

  static async checkAvailability(
    variantId: string,
    locationId: string,
    quantity: number | string | Prisma.Decimal,
    tx?: Prisma.TransactionClient
  ): Promise<StockAvailabilityResult> {
    if (!variantId) throw new ValidationError('Variant ID is required');
    if (!locationId) throw new ValidationError('Location ID is required');
    const reqQty = this.normalizeQuantity(quantity);

    const db = tx ?? prisma;
    const balance = await db.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId, locationId } }
    });

    if (!balance) {
      return {
        variantId,
        locationId,
        requestedQuantity: reqQty.toString(),
        onHandQuantity: '0',
        reservedQuantity: '0',
        availableQuantity: '0',
        isAvailable: false,
        hasBalance: false
      };
    }

    const onHand = new Prisma.Decimal(balance.quantity.toString());
    const reserved = new Prisma.Decimal(balance.reserved.toString());
    const available = onHand.sub(reserved);

    if (onHand.lt(0) || reserved.lt(0) || available.lt(0)) {
      throw new ConflictError(
        `Inconsistent inventory balance detected for variant ${variantId} at location ${locationId}: negative on-hand (${onHand}) or available stock (${available}).`
      );
    }

    return {
      variantId,
      locationId,
      requestedQuantity: reqQty.toString(),
      onHandQuantity: onHand.toString(),
      reservedQuantity: reserved.toString(),
      availableQuantity: available.toString(),
      isAvailable: available.gte(reqQty),
      hasBalance: true
    };
  }

  static async checkMultipleAvailability(
    items: Array<{ variantId: string; locationId: string; quantity: number | string | Prisma.Decimal }>,
    tx?: Prisma.TransactionClient
  ): Promise<MultiStockAvailabilityResult> {
    if (!items || items.length === 0) {
      throw new ValidationError('Items array cannot be empty');
    }

    const aggregated = new Map<string, { variantId: string; locationId: string; quantity: Prisma.Decimal }>();
    for (const item of items) {
      if (!item.variantId) throw new ValidationError('Variant ID is required for all items');
      if (!item.locationId) throw new ValidationError('Location ID is required for all items');
      const qty = this.normalizeQuantity(item.quantity);
      const key = `${item.locationId}:${item.variantId}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity = existing.quantity.add(qty);
      } else {
        aggregated.set(key, { variantId: item.variantId, locationId: item.locationId, quantity: qty });
      }
    }

    const results: StockAvailabilityResult[] = [];
    for (const entry of aggregated.values()) {
      const res = await this.checkAvailability(entry.variantId, entry.locationId, entry.quantity, tx);
      results.push(res);
    }

    return {
      isAllAvailable: results.every(r => r.isAvailable),
      items: results
    };
  }

  static async deductMultipleStock(
    data: DeductMultipleStockInput,
    externalTx?: Prisma.TransactionClient
  ): Promise<MultiStockDeductionResult> {
    if (!data.locationId) throw new ValidationError('Location ID is required');
    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Deduction items cannot be empty');
    }

    const db = externalTx ?? prisma;
    const loc = await db.inventoryLocation.findUnique({ where: { id: data.locationId } });
    if (!loc) throw new NotFoundError('Location not found');
    if (!loc.isActive) throw new ValidationError('Location is inactive');

    // Aggregate repeated variant entries before locking and deducting
    const aggregated = new Map<string, Prisma.Decimal>();
    for (const item of data.items) {
      if (!item.variantId) throw new ValidationError('Variant ID is required for all items');
      const qty = this.normalizeQuantity(item.quantity);
      const current = aggregated.get(item.variantId) ?? new Prisma.Decimal(0);
      aggregated.set(item.variantId, current.add(qty));
    }

    // Determine expected idempotency keys for all aggregated variants
    const expectedKeys = data.idempotencyKey
      ? (aggregated.size === 1
          ? [data.idempotencyKey]
          : Array.from(aggregated.keys()).map(vId => `${data.idempotencyKey}:${vId}`))
      : [];

    // Idempotency pre-check
    if (data.idempotencyKey) {
      const existingMovements = await db.stockMovement.findMany({
        where: {
          OR: [
            { idempotencyKey: data.idempotencyKey },
            { idempotencyKey: { startsWith: `${data.idempotencyKey}:` } }
          ]
        },
        include: { location: true, variant: { include: { product: true } } }
      });

      if (existingMovements.length > 0) {
        if (existingMovements.length !== expectedKeys.length) {
          throw new ConflictError(
            `Partial idempotency collision: found ${existingMovements.length} of ${expectedKeys.length} expected movements for key '${data.idempotencyKey}'.`
          );
        }
        this.assertDeductionPayloadEquivalence(existingMovements, data, aggregated);
        const balances = await db.inventoryBalance.findMany({
          where: {
            locationId: data.locationId,
            variantId: { in: existingMovements.map(m => m.variantId) }
          },
          include: { location: true, variant: { include: { product: true } } }
        });
        const balMap = new Map(balances.map(b => [b.variantId, b]));

        return {
          deductions: existingMovements.map(m => {
            const bal = balMap.get(m.variantId);
            return {
              balance: toSafeBalance(bal),
              movement: toSafeMovement(m),
              deductedQuantity: m.quantity.toString(),
              remainingQuantity: bal ? bal.quantity.toString() : '0'
            };
          })
        };
      }
    }

    // Deterministic variant sorting for lock acquisition
    const sortedVariantIds = Array.from(aggregated.keys()).sort((a, b) => a.localeCompare(b));

    const executeTx = async (tx: Prisma.TransactionClient): Promise<MultiStockDeductionResult> => {
      if (activeInventoryTestHook) {
        await activeInventoryTestHook('before_balance_lock', { sortedVariantIds, locationId: data.locationId });
      }

      // Level 8 Lock: InventoryBalance rows locked FOR UPDATE in deterministic ascending order
      const lockedBalances = await tx.$queryRaw<Array<{
        id: string;
        variantId: string;
        locationId: string;
        quantity: Prisma.Decimal;
        reserved: Prisma.Decimal;
      }>>`
        SELECT id, "variantId", "locationId", quantity, reserved
        FROM "InventoryBalance"
        WHERE "locationId" = ${data.locationId}
          AND "variantId" IN (${Prisma.join(sortedVariantIds)})
        ORDER BY id ASC
        FOR UPDATE
      `;

      if (activeInventoryTestHook) {
        await activeInventoryTestHook('after_balance_lock', { lockedBalances, locationId: data.locationId });
      }

      const lockedMap = new Map(lockedBalances.map(b => [b.variantId, b]));

      // 1. Recheck availability of all items under lock BEFORE making any mutation
      for (const [variantId, reqQty] of aggregated.entries()) {
        const balance = lockedMap.get(variantId);
        if (!balance) {
          throw new InsufficientStockError(
            `Insufficient stock for variant ${variantId}: no inventory balance found at location ${data.locationId}.`,
            { variantId, available: '0', requested: reqQty.toString() }
          );
        }

        const onHand = new Prisma.Decimal(balance.quantity.toString());
        const reserved = new Prisma.Decimal(balance.reserved.toString());
        const available = onHand.sub(reserved);

        if (onHand.lt(0) || reserved.lt(0) || available.lt(0)) {
          throw new ConflictError(
            `Inconsistent inventory balance detected for variant ${variantId}: negative on-hand (${onHand}) or reserved (${reserved}).`
          );
        }

        if (available.lt(reqQty)) {
          throw new InsufficientStockError(
            `Insufficient stock for variant ${variantId}. Available: ${available.toString()}, Required: ${reqQty.toString()}`,
            { variantId, available: available.toString(), requested: reqQty.toString() }
          );
        }
      }

      // 2. Perform deductions and create matching StockMovements
      const deductions: StockDeductionResult[] = [];
      for (const [variantId, reqQty] of aggregated.entries()) {
        const balance = lockedMap.get(variantId)!;
        const newQuantity = new Prisma.Decimal(balance.quantity.toString()).sub(reqQty);

        const updatedBalance = await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { quantity: newQuantity },
          include: { location: true, variant: { include: { product: true } } }
        });

        const itemKey = data.idempotencyKey
          ? (aggregated.size === 1 ? data.idempotencyKey : `${data.idempotencyKey}:${variantId}`)
          : undefined;

        const movement = await tx.stockMovement.create({
          data: {
            variantId,
            locationId: data.locationId,
            userId: data.userId ?? null,
            billId: data.billId ?? null,
            type: MovementType.ISSUE,
            quantity: reqQty,
            reference: data.reference ?? null,
            reason: data.reason ?? 'Stock deduction',
            idempotencyKey: itemKey
          }
        });

        deductions.push({
          balance: toSafeBalance(updatedBalance),
          movement: toSafeMovement(movement),
          deductedQuantity: reqQty.toString(),
          remainingQuantity: newQuantity.toString()
        });
      }

      return { deductions };
    };

    if (externalTx) {
      try {
        return await executeTx(externalTx);
      } catch (err: any) {
        if (
          err.code === 'P2002' &&
          data.idempotencyKey &&
          (err.meta?.target?.includes('idempotencyKey') || err.message?.includes('idempotencyKey'))
        ) {
          throw new ConflictError(
            `Concurrent inventory deduction conflict on idempotency key '${data.idempotencyKey}'. The active transaction has been aborted by the database and must be rolled back by the caller.`
          );
        }
        throw err;
      }
    }

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await prisma.$transaction(async (tx) => executeTx(tx), {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (err: any) {
        if (
          err.code === 'P2002' &&
          data.idempotencyKey &&
          (err.meta?.target?.includes('idempotencyKey') || err.message?.includes('idempotencyKey'))
        ) {
          const committed = await prisma.stockMovement.findMany({
            where: {
              OR: [
                { idempotencyKey: data.idempotencyKey },
                { idempotencyKey: { startsWith: `${data.idempotencyKey}:` } }
              ]
            },
            include: { location: true, variant: { include: { product: true } } }
          });
          if (committed.length > 0) {
            if (committed.length !== expectedKeys.length) {
              throw new ConflictError(
                `Partial idempotency collision: found ${committed.length} of ${expectedKeys.length} expected movements for key '${data.idempotencyKey}'.`
              );
            }
            this.assertDeductionPayloadEquivalence(committed, data, aggregated);
            const balances = await prisma.inventoryBalance.findMany({
              where: {
                locationId: data.locationId,
                variantId: { in: committed.map(m => m.variantId) }
              },
              include: { location: true, variant: { include: { product: true } } }
            });
            const balMap = new Map(balances.map(b => [b.variantId, b]));
            return {
              deductions: committed.map(m => {
                const bal = balMap.get(m.variantId);
                return {
                  balance: toSafeBalance(bal),
                  movement: toSafeMovement(m),
                  deductedQuantity: m.quantity.toString(),
                  remainingQuantity: bal ? bal.quantity.toString() : '0'
                };
              })
            };
          }
        }

        if (attempts < maxAttempts && isRetryableDbError(err)) {
          await new Promise(r => setTimeout(r, 20 * Math.pow(2, attempts) + Math.random() * 20));
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError('Transaction conflict: maximum retry attempts exceeded.');
  }

  static async deductStock(
    data: DeductStockInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockDeductionResult> {
    const result = await this.deductMultipleStock(
      {
        locationId: data.locationId,
        items: [{ variantId: data.variantId, quantity: data.quantity }],
        reference: data.reference,
        reason: data.reason,
        userId: data.userId,
        idempotencyKey: data.idempotencyKey,
        billId: data.billId
      },
      tx
    );
    return result.deductions[0]!;
  }

  static async issueStock(
    data: {
      variantId: string;
      locationId: string;
      quantity: number;
      reference: string;
      reason?: string;
      idempotencyKey?: string;
      userId?: string;
    },
    tx?: Prisma.TransactionClient
  ) {
    const result = await this.deductStock(
      {
        variantId: data.variantId,
        locationId: data.locationId,
        quantity: data.quantity,
        reference: data.reference,
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
        userId: data.userId
      },
      tx
    );
    return { movement: result.movement };
  }

  static async adjustStock(data: { variantId: string, locationId: string, quantity: number, type: MovementType, reason: string, reference?: string, idempotencyKey?: string, userId?: string }) {
    await this.checkIdempotency(data.idempotencyKey);

    return await prisma.$transaction(async (tx) => {
      const isNegative = data.type === MovementType.NEGATIVE_ADJUSTMENT;
      
      let balance = await tx.inventoryBalance.findUnique({
        where: { variantId_locationId: { variantId: data.variantId, locationId: data.locationId } }
      });

      if (isNegative) {
        if (!balance || balance.quantity.toNumber() < data.quantity) {
          throw new ConflictError('Cannot adjust below zero stock.');
        }
        const updateResult = await tx.inventoryBalance.updateMany({
          where: { id: balance.id, quantity: { gte: data.quantity } },
          data: { quantity: { decrement: data.quantity } }
        });
        if (updateResult.count === 0) throw new ConflictError('Concurrent update conflict.');
      } else {
        if (!balance) {
          balance = await tx.inventoryBalance.create({
            data: { variantId: data.variantId, locationId: data.locationId, quantity: data.quantity }
          });
        } else {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { quantity: { increment: data.quantity } }
          });
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          variantId: data.variantId, locationId: data.locationId,
          type: data.type, quantity: data.quantity,
          reason: data.reason, reference: data.reference,
          userId: data.userId, idempotencyKey: data.idempotencyKey
        }
      });
      return { movement };
    });
  }

  static async transferStock(data: {
    variantId: string;
    sourceId: string;
    destinationId: string;
    quantity: number | string | Prisma.Decimal;
    reference?: string;
    idempotencyKey?: string;
    userId?: string;
  }) {
    if (!data.variantId) throw new ValidationError('Variant ID is required');
    if (!data.sourceId) throw new ValidationError('Source location ID is required');
    if (!data.destinationId) throw new ValidationError('Destination location ID is required');
    if (data.sourceId === data.destinationId) throw new BadRequestError('Source and destination cannot be the same');
    const reqQty = this.normalizeQuantity(data.quantity);

    // Idempotency check with payload integrity verification
    if (data.idempotencyKey) {
      const outKey = `${data.idempotencyKey}-out`;
      const inKey = `${data.idempotencyKey}-in`;
      const existingMovements = await prisma.stockMovement.findMany({
        where: { idempotencyKey: { in: [data.idempotencyKey, outKey, inKey] } },
        include: { transfer: true }
      });

      if (existingMovements.length > 0) {
        const outMovement = existingMovements.find(m => m.type === MovementType.TRANSFER_OUT);
        if (outMovement) {
          if (
            outMovement.variantId !== data.variantId ||
            outMovement.locationId !== data.sourceId ||
            !new Prisma.Decimal(outMovement.quantity.toString()).equals(reqQty)
          ) {
            throw new ConflictError(
              `Idempotency key '${data.idempotencyKey}' already used with different transfer parameters.`
            );
          }
          if (outMovement.transfer) {
            return { transfer: outMovement.transfer };
          }
          if (outMovement.transferId) {
            const transfer = await prisma.stockTransfer.findUnique({
              where: { id: outMovement.transferId }
            });
            if (transfer) return { transfer };
          }
        }
        throw new ConflictError('This operation has already been processed.');
      }
    }

    const executeTransfer = async (tx: Prisma.TransactionClient) => {
      const srcLoc = await tx.inventoryLocation.findUnique({ where: { id: data.sourceId } });
      const destLoc = await tx.inventoryLocation.findUnique({ where: { id: data.destinationId } });
      if (!srcLoc?.isActive || !destLoc?.isActive) throw new BadRequestError('Locations must be active');

      const variant = await tx.productVariant.findUnique({ where: { id: data.variantId } });
      if (!variant?.isActive) throw new BadRequestError('Variant is inactive or missing');

      // Deterministically ensure InventoryBalance rows exist for both locations in alphabetical order
      // to avoid deadlocks during concurrent creation. Uses native PostgreSQL ON CONFLICT DO NOTHING.
      const sortedLocIds = [data.sourceId, data.destinationId].sort((a, b) => a.localeCompare(b));
      for (const locId of sortedLocIds) {
        await tx.$executeRaw`
          INSERT INTO "InventoryBalance" ("id", "variantId", "locationId", "quantity", "reserved", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${data.variantId}, ${locId}, 0, 0, NOW(), NOW())
          ON CONFLICT ("variantId", "locationId") DO NOTHING
        `;
      }

      // Level 8 Lock: Deterministic row locking on InventoryBalance ordered by id ASC FOR UPDATE
      const lockedBalances = await tx.$queryRaw<Array<{
        id: string;
        variantId: string;
        locationId: string;
        quantity: Prisma.Decimal;
        reserved: Prisma.Decimal;
      }>>`
        SELECT id, "variantId", "locationId", quantity, reserved
        FROM "InventoryBalance"
        WHERE "variantId" = ${data.variantId}
          AND "locationId" IN (${data.sourceId}, ${data.destinationId})
        ORDER BY id ASC
        FOR UPDATE
      `;

      const srcBalance = lockedBalances.find(b => b.locationId === data.sourceId);
      const destBalance = lockedBalances.find(b => b.locationId === data.destinationId);

      if (!srcBalance) {
        throw new ConflictError('Source inventory balance record not found.');
      }
      if (!destBalance) {
        throw new ConflictError('Destination inventory balance record not found.');
      }

      const srcOnHand = new Prisma.Decimal(srcBalance.quantity.toString());
      const srcReserved = new Prisma.Decimal(srcBalance.reserved.toString());
      const srcAvailable = srcOnHand.sub(srcReserved);

      if (srcOnHand.lt(0) || srcReserved.lt(0) || srcAvailable.lt(0)) {
        throw new ConflictError(
          `Inconsistent source inventory balance detected: onHand (${srcOnHand}), reserved (${srcReserved}).`
        );
      }

      if (srcAvailable.lt(reqQty)) {
        throw new ConflictError('Insufficient stock at source location.');
      }

      // Update source and destination balances under the deterministic lock
      await tx.inventoryBalance.update({
        where: { id: srcBalance.id },
        data: { quantity: srcOnHand.sub(reqQty) }
      });

      const destOnHand = new Prisma.Decimal(destBalance.quantity.toString());
      await tx.inventoryBalance.update({
        where: { id: destBalance.id },
        data: { quantity: destOnHand.add(reqQty) }
      });

      const transfer = await tx.stockTransfer.create({
        data: {
          sourceId: data.sourceId,
          destinationId: data.destinationId,
          status: TransferStatus.COMPLETED,
          reference: data.reference ?? null
        }
      });

      // Level 9: Append auditable StockMovements
      await tx.stockMovement.create({
        data: {
          variantId: data.variantId,
          locationId: data.sourceId,
          type: MovementType.TRANSFER_OUT,
          quantity: reqQty,
          transferId: transfer.id,
          userId: data.userId ?? null,
          reference: data.reference ?? null,
          reason: 'Stock transfer out',
          idempotencyKey: data.idempotencyKey ? `${data.idempotencyKey}-out` : null
        }
      });

      await tx.stockMovement.create({
        data: {
          variantId: data.variantId,
          locationId: data.destinationId,
          type: MovementType.TRANSFER_IN,
          quantity: reqQty,
          transferId: transfer.id,
          userId: data.userId ?? null,
          reference: data.reference ?? null,
          reason: 'Stock transfer in',
          idempotencyKey: data.idempotencyKey ? `${data.idempotencyKey}-in` : null
        }
      });

      return { transfer };
    };

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        return await prisma.$transaction(async (tx) => executeTransfer(tx), {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        });
      } catch (err: any) {
        if (
          err.code === 'P2002' &&
          data.idempotencyKey &&
          (err.meta?.target?.includes('idempotencyKey') || err.message?.includes('idempotencyKey'))
        ) {
          const outKey = `${data.idempotencyKey}-out`;
          const committed = await prisma.stockMovement.findFirst({
            where: { idempotencyKey: outKey },
            include: { transfer: true }
          });
          if (committed?.transfer) {
            if (
              committed.variantId !== data.variantId ||
              committed.locationId !== data.sourceId ||
              !new Prisma.Decimal(committed.quantity.toString()).equals(reqQty)
            ) {
              throw new ConflictError(
                `Idempotency key '${data.idempotencyKey}' already used with different transfer parameters.`
              );
            }
            return { transfer: committed.transfer };
          }

          if (attempts < maxAttempts) {
            const backoffMs = attempts * 50;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw new ConflictError(
            `Concurrent stock transfer collision on idempotency key '${data.idempotencyKey}'.`
          );
        }

        if (attempts < maxAttempts && isRetryableDbError(err)) {
          const backoffMs = attempts * 50;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw err;
      }
    }

    throw new ConflictError('Transfer transaction conflict: maximum retry attempts exceeded.');
  }

  static async getMovements(filters: { variantId?: string, locationId?: string }, page = 1, limit = 50) {
    const where = { ...filters };
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.stockMovement.count({ where })
    ]);
    return { items, total };
  }

  private static assertDeductionPayloadEquivalence(
    movements: any[],
    data: DeductMultipleStockInput,
    aggregated: Map<string, Prisma.Decimal>
  ): void {
    if (movements.length !== aggregated.size) {
      throw new ConflictError(`Idempotency key '${data.idempotencyKey}' already used with different set of items.`);
    }
    if (data.billId && movements.some(m => m.billId && m.billId !== data.billId)) {
      throw new ConflictError(`Idempotency key '${data.idempotencyKey}' already used for another bill.`);
    }
    if (movements.some(m => m.locationId !== data.locationId)) {
      throw new ConflictError(`Idempotency key '${data.idempotencyKey}' already used for a different inventory location.`);
    }
    if (movements.some(m => m.type !== MovementType.ISSUE)) {
      throw new ConflictError(`Idempotency key '${data.idempotencyKey}' already used for a different movement type.`);
    }
    const movementByVariant = new Map(movements.map(m => [m.variantId, m]));
    for (const [variantId, reqQty] of aggregated.entries()) {
      const m = movementByVariant.get(variantId);
      if (!m || !new Prisma.Decimal(m.quantity.toString()).equals(reqQty)) {
        throw new ConflictError(`Idempotency key '${data.idempotencyKey}' already used with different variant or quantity.`);
      }
    }
  }
}
