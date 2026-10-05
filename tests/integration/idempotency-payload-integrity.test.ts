/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { PaymentService } from '../../src/features/billing/payment.service';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { ConflictError } from '../../src/lib/errors';
import { BillStatus, MovementType, PaymentMethod } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3.2 — Idempotency Payload Integrity & Failure-Injection Verification', () => {
  let location1: any;
  let location2: any;
  let category: any;
  let product: any;
  let variant1: any;
  let variant2: any;
  let customer: any;

  beforeAll(async () => {
    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();

    customer = await prisma.customer.create({
      data: {
        name: 'Payload Integrity Test Customer',
        phoneNumber: '9777766666',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Pipes & Fittings' } });
    product = await prisma.product.create({
      data: { name: 'CPVC Ball Valve', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CPVC-01', sellingPrice: 250, isActive: true }
    });
    variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'CPVC-02', sellingPrice: 450, isActive: true }
    });

    location1 = await prisma.inventoryLocation.create({
      data: { code: 'WH-MAIN', name: 'Main Warehouse', isActive: true, isDefault: true }
    });
    location2 = await prisma.inventoryLocation.create({
      data: { code: 'WH-SECONDARY', name: 'Secondary Store', isActive: true, isDefault: false }
    });
  });

  afterAll(async () => {
    BillService.__setBillTestHook(null);
    PaymentService.__setPaymentTestHook(null);

    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.estimateLine.deleteMany();
    await prisma.estimate.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryLocation.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.customer.deleteMany();
  });

  beforeEach(async () => {
    BillService.__setBillTestHook(null);
    PaymentService.__setPaymentTestHook(null);

    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  async function createDraftBill(quantities = { v1: '2', v2: '1' }, locId = location1.id) {
    return BillService.createBill({
      customerId: customer.id,
      locationId: locId,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'CPVC Ball Valve 1/2"',
          quantity: quantities.v1,
          unitRate: '250',
          discountAmount: '0',
          taxRate: '0'
        },
        {
          variantId: variant2.id,
          productSnapshot: 'CPVC Ball Valve 3/4"',
          quantity: quantities.v2,
          unitRate: '450',
          discountAmount: '0',
          taxRate: '0'
        }
      ]
    });
  }

  async function setupStock(qty1 = 100, qty2 = 100, locId = location1.id) {
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locId } },
      create: { variantId: variant1.id, locationId: locId, quantity: qty1, reserved: 0 },
      update: { quantity: qty1, reserved: 0 }
    });
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant2.id, locationId: locId } },
      create: { variantId: variant2.id, locationId: locId, quantity: qty2, reserved: 0 },
      update: { quantity: qty2, reserved: 0 }
    });
  }

  // ===========================================================================
  // SECTION 1: PAYMENT IDEMPOTENCY PAYLOAD INTEGRITY
  // ===========================================================================

  it('1. payment idempotency: identical retry returns original payment without mutations', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-SAME-1';
    const p1 = await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date('2026-10-01T10:00:00Z'),
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-001',
      idempotencyKey: key
    });

    // Replay with exact same parameters
    const p2 = await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date('2026-10-01T10:00:00Z'),
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-001',
      idempotencyKey: key
    });

    expect(p1.id).toBe(p2.id);
    expect(p2.amount).toBe('200');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(1);

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.amountPaid.toString()).toBe('200');
  });

  it('1b. payment idempotency: changed explicit paymentDate returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DIFF-DATE';
    await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date('2026-10-01T10:00:00Z'),
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-002',
      idempotencyKey: key
    });

    // Attempt replay with changed explicit date
    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: new Date('2026-10-01T10:05:00Z'), // Changed explicit date (+5 mins)
        paymentMethod: PaymentMethod.CASH,
        transactionRef: 'REC-002',
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('1b_boundary_plus1ms. payment idempotency: date changed by +1ms rejected with ConflictError (exact boundary)', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DATE-PLUS1MS';
    const baseDate = new Date('2026-10-01T10:00:00.000Z');
    await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: baseDate,
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-BOUND-1',
      idempotencyKey: key
    });

    // Attempt replay with exactly +1 millisecond difference
    const plus1ms = new Date(baseDate.getTime() + 1);
    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: plus1ms,
        paymentMethod: PaymentMethod.CASH,
        transactionRef: 'REC-BOUND-1',
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('1b_boundary_minus1ms. payment idempotency: date changed by -1ms rejected with ConflictError (exact boundary)', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DATE-MINUS1MS';
    const baseDate = new Date('2026-10-01T10:00:00.000Z');
    await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: baseDate,
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-BOUND-2',
      idempotencyKey: key
    });

    // Attempt replay with exactly -1 millisecond difference
    const minus1ms = new Date(baseDate.getTime() - 1);
    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: minus1ms,
        paymentMethod: PaymentMethod.CASH,
        transactionRef: 'REC-BOUND-2',
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('1b_boundary_plus5000ms. payment idempotency: date changed by +5000ms rejected with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DATE-PLUS5000MS';
    const baseDate = new Date('2026-10-01T10:00:00.000Z');
    await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: baseDate,
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-BOUND-3',
      idempotencyKey: key
    });

    // Attempt replay with +5000ms
    const plus5000ms = new Date(baseDate.getTime() + 5000);
    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: plus5000ms,
        paymentMethod: PaymentMethod.CASH,
        transactionRef: 'REC-BOUND-3',
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('1c. payment idempotency: omitted paymentDate (server-generated timestamp) succeeds on replay without clock drift failure', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-OMITTED-DATE';
    const p1 = await PaymentService.recordPayment(issued.id, {
      amount: '150',
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-AUTO-1',
      idempotencyKey: key
    });

    // Replay moments later without providing paymentDate (server timestamp naturally drifts)
    await new Promise(r => setTimeout(r, 10));
    const p2 = await PaymentService.recordPayment(issued.id, {
      amount: '150',
      paymentMethod: PaymentMethod.CASH,
      transactionRef: 'REC-AUTO-1',
      idempotencyKey: key
    });

    expect(p1.id).toBe(p2.id);
    expect(p2.amount).toBe('150');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(1);
  });

  it('2. payment idempotency: changed amount returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DIFF-AMOUNT';
    await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '300', // Changed amount
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(1);
    expect(payments[0]!.amount.toString()).toBe('200');
  });

  it('3. payment idempotency: changed payment method returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DIFF-METHOD';
    await PaymentService.recordPayment(issued.id, {
      amount: '150',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '150',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.UPI, // Changed payment method
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('4. payment idempotency: changed transactionRef returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-IDEM-DIFF-REF';
    await PaymentService.recordPayment(issued.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.UPI,
      transactionRef: 'UPI-TXN-ORIGINAL',
      idempotencyKey: key
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.UPI,
        transactionRef: 'UPI-TXN-CHANGED', // Changed transaction reference
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('5. payment idempotency: changed bill ID returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft1 = await createDraftBill();
    const draft2 = await createDraftBill();
    const issued1 = await BillService.issueBill(draft1.id);
    const issued2 = await BillService.issueBill(draft2.id);

    const key = 'PAY-IDEM-DIFF-BILL';
    await PaymentService.recordPayment(issued1.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });

    await expect(
      PaymentService.recordPayment(issued2.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('6. payment idempotency: concurrent requests with same key but different amounts accept at most one', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'PAY-CONCURRENT-DIFF-AMOUNT';
    const results = await Promise.allSettled([
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      }),
      PaymentService.recordPayment(issued.id, {
        amount: '200', // Different amount racing
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ConflictError);

    // Exactly 1 payment created in database
    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(1);
  });

  // ===========================================================================
  // SECTION 2: BILL ISSUANCE IDEMPOTENCY PAYLOAD INTEGRITY
  // ===========================================================================

  it('7. issuance idempotency: identical retry returns original bill without duplicate movements', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();

    const key = 'ISSUE-IDEM-SAME-1';
    const b1 = await BillService.issueBill(draft.id, {
      locationId: location1.id,
      idempotencyKey: key
    });
    expect(b1.status).toBe(BillStatus.ISSUED);

    const b2 = await BillService.issueBill(draft.id, {
      locationId: location1.id,
      idempotencyKey: key
    });
    expect(b2.status).toBe(BillStatus.ISSUED);
    expect(b1.id).toBe(b2.id);

    // Verify stock balance decremented exactly once (50 - 2 = 48)
    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(bal?.quantity.toString()).toBe('48');

    const movements = await prisma.stockMovement.findMany({
      where: { billId: draft.id, type: MovementType.ISSUE }
    });
    expect(movements.length).toBe(2);
  });

  it('8. issuance idempotency: changed location returns ConflictError', async () => {
    await setupStock(50, 50, location1.id);
    await setupStock(50, 50, location2.id);
    const draft = await createDraftBill();

    const key = 'ISSUE-IDEM-DIFF-LOC';
    await BillService.issueBill(draft.id, {
      locationId: location1.id,
      idempotencyKey: key
    });

    // Replaying with changed location
    await expect(
      BillService.issueBill(draft.id, {
        locationId: location2.id, // Changed location
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('9. issuance idempotency: calling issueBill with different key on already issued bill does not re-issue', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();

    await BillService.issueBill(draft.id, {
      locationId: location1.id,
      idempotencyKey: 'ISSUE-KEY-A'
    });

    // Calling with a DIFFERENT key on an already issued bill must throw ConflictError
    await expect(
      BillService.issueBill(draft.id, {
        locationId: location1.id,
        idempotencyKey: 'ISSUE-KEY-B' // Different key
      })
    ).rejects.toThrow(ConflictError);

    // Verify inventory movements were NOT duplicated
    const movements = await prisma.stockMovement.findMany({
      where: { billId: draft.id, type: MovementType.ISSUE }
    });
    expect(movements.length).toBe(2);
  });

  // ===========================================================================
  // SECTION 3: BILL CANCELLATION IDEMPOTENCY PAYLOAD INTEGRITY
  // ===========================================================================

  it('10. cancellation idempotency: identical retry returns original cancelled bill', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    const key = 'CANCEL-IDEM-SAME-1';
    const c1 = await BillService.cancelBill(issued.id, {
      idempotencyKey: key,
      reason: 'Customer cancelled'
    });
    expect(c1.status).toBe(BillStatus.CANCELLED);

    const c2 = await BillService.cancelBill(issued.id, {
      idempotencyKey: key,
      reason: 'Customer cancelled'
    });
    expect(c2.status).toBe(BillStatus.CANCELLED);

    // Verify restoration movements occurred exactly once
    const movements = await prisma.stockMovement.findMany({
      where: { billId: issued.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(movements.length).toBe(2);

    const bal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(bal?.quantity.toString()).toBe('50'); // Restored once
  });

  it('11. cancellation idempotency: changed bill ID returns ConflictError', async () => {
    await setupStock(50, 50);
    const draft1 = await createDraftBill();
    const draft2 = await createDraftBill();
    const issued1 = await BillService.issueBill(draft1.id);
    const issued2 = await BillService.issueBill(draft2.id);

    const key = 'CANCEL-IDEM-DIFF-BILL';
    await BillService.cancelBill(issued1.id, { idempotencyKey: key });

    // Attempting to cancel bill 2 with bill 1's cancellation key
    await expect(
      BillService.cancelBill(issued2.id, { idempotencyKey: key })
    ).rejects.toThrow(ConflictError);
  });

  // ===========================================================================
  // SECTION 4: INVENTORY DEDUCTION IDEMPOTENCY PAYLOAD INTEGRITY
  // ===========================================================================

  it('12. inventory deduction: identical retry returns original deductions', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-IDEM-SAME-1';

    const r1 = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '5' },
        { variantId: variant2.id, quantity: '3' }
      ],
      idempotencyKey: key
    });

    const r2 = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '5' },
        { variantId: variant2.id, quantity: '3' }
      ],
      idempotencyKey: key
    });

    expect(r1.deductions.length).toBe(2);
    expect(r2.deductions.length).toBe(2);

    // Balance deducted only once (50 - 5 = 45)
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(bal1?.quantity.toString()).toBe('45');
  });

  it('13. inventory deduction: changed quantity returns ConflictError', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-IDEM-DIFF-QTY';

    await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [{ variantId: variant1.id, quantity: '5' }],
      idempotencyKey: key
    });

    await expect(
      InventoryService.deductMultipleStock({
        locationId: location1.id,
        items: [{ variantId: variant1.id, quantity: '10' }], // Changed quantity
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('14. inventory deduction: changed variant returns ConflictError', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-IDEM-DIFF-VARIANT';

    await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [{ variantId: variant1.id, quantity: '5' }],
      idempotencyKey: key
    });

    await expect(
      InventoryService.deductMultipleStock({
        locationId: location1.id,
        items: [{ variantId: variant2.id, quantity: '5' }], // Changed variant
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('15. inventory deduction: changed location returns ConflictError', async () => {
    await setupStock(50, 50, location1.id);
    await setupStock(50, 50, location2.id);
    const key = 'DEDUCT-IDEM-DIFF-LOC';

    await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [{ variantId: variant1.id, quantity: '5' }],
      idempotencyKey: key
    });

    await expect(
      InventoryService.deductMultipleStock({
        locationId: location2.id, // Changed location
        items: [{ variantId: variant1.id, quantity: '5' }],
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  it('16. inventory movement subkey cannot be reused for a different movement payload', async () => {
    await setupStock(50, 50);
    const mainKey = 'DEDUCT-MULTI-SUBKEY-TEST';

    await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '2' },
        { variantId: variant2.id, quantity: '4' }
      ],
      idempotencyKey: mainKey
    });

    // Subkey for variant1 is `DEDUCT-MULTI-SUBKEY-TEST:${variant1.id}`
    const subkey = `${mainKey}:${variant1.id}`;

    // Attempting to call deductStock using this subkey but with a different quantity (e.g. 10)
    await expect(
      InventoryService.deductStock({
        variantId: variant1.id,
        locationId: location1.id,
        quantity: 10, // Changed quantity
        idempotencyKey: subkey
      })
    ).rejects.toThrow(ConflictError);
  });

  it('16b. inventory deduction: reordered items with identical quantities succeed idempotently', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-REORDER-TEST';

    const first = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '2' },
        { variantId: variant2.id, quantity: '3' }
      ],
      idempotencyKey: key
    });
    expect(first.deductions.length).toBe(2);

    // Second call with REORDERED items: variant2 first, then variant1
    const second = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant2.id, quantity: '3' },
        { variantId: variant1.id, quantity: '2' }
      ],
      idempotencyKey: key
    });
    expect(second.deductions.length).toBe(2);

    // Verify stock only deducted ONCE (50 - 2 = 48, 50 - 3 = 47)
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant2.id, locationId: location1.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48');
    expect(bal2?.quantity.toString()).toBe('47');

    const movements = await prisma.stockMovement.findMany({
      where: { idempotencyKey: { in: [`${key}:${variant1.id}`, `${key}:${variant2.id}`] } }
    });
    expect(movements.length).toBe(2);
  });

  it('16c. inventory deduction: duplicate variant items are aggregated and succeed idempotently', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-AGGREGATE-TEST';

    // First call: duplicate variant1 items (1 + 2 = 3)
    const first = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '1' },
        { variantId: variant1.id, quantity: '2' }
      ],
      idempotencyKey: key
    });
    expect(first.deductions.length).toBe(1);
    expect(first.deductions[0]!.deductedQuantity).toBe('3');

    // Second call: single variant1 item with total quantity 3
    const second = await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '3' }
      ],
      idempotencyKey: key
    });
    expect(second.deductions.length).toBe(1);
    expect(second.deductions[0]!.deductedQuantity).toBe('3');

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(bal1?.quantity.toString()).toBe('47'); // 50 - 3 = 47
  });

  it('16d. inventory deduction: request with fewer items than original throws ConflictError', async () => {
    await setupStock(50, 50);
    const key = 'DEDUCT-MISMATCH-COUNT-TEST';

    await InventoryService.deductMultipleStock({
      locationId: location1.id,
      items: [
        { variantId: variant1.id, quantity: '2' },
        { variantId: variant2.id, quantity: '3' }
      ],
      idempotencyKey: key
    });

    // Retry with only variant1
    await expect(
      InventoryService.deductMultipleStock({
        locationId: location1.id,
        items: [
          { variantId: variant1.id, quantity: '2' }
        ],
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });

  // ===========================================================================
  // SECTION 5: FAILURE INJECTION ROLLBACK AND SAFE RETRY VERIFICATION
  // ===========================================================================

  it('17. failed issuance does not leave idempotency record and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const key = 'ISSUE-FAIL-THEN-RETRY';

    // Inject failure after stock deduction
    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_stock_deduction') {
        throw new Error('SIMULATED_FAILURE_AFTER_STOCK_DEDUCTION');
      }
    });

    await expect(
      BillService.issueBill(draft.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_STOCK_DEDUCTION');

    // Confirm total rollback: bill is DRAFT, balance intact, 0 movements
    const billAfterFail = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(billAfterFail?.status).toBe(BillStatus.DRAFT);

    const balAfterFail = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(balAfterFail?.quantity.toString()).toBe('50');

    const movAfterFail = await prisma.stockMovement.findMany({ where: { billId: draft.id } });
    expect(movAfterFail.length).toBe(0);

    // Clear hook and retry with the EXACT same idempotency key
    BillService.__setBillTestHook(null);
    const issuedBill = await BillService.issueBill(draft.id, { idempotencyKey: key });
    expect(issuedBill.status).toBe(BillStatus.ISSUED);

    const balAfterSuccess = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(balAfterSuccess?.quantity.toString()).toBe('48');
  });

  it('18. failed payment does not leave idempotency record and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'PAY-FAIL-THEN-RETRY';

    // Inject failure after payment insert
    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'after_payment_insert') {
        throw new Error('SIMULATED_FAILURE_AFTER_PAYMENT_INSERT');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_PAYMENT_INSERT');

    // Confirm rollback: 0 payments in database, bill amountPaid: 0
    const paymentsAfterFail = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(paymentsAfterFail.length).toBe(0);

    const billAfterFail = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfterFail?.amountPaid.toString()).toBe('0');

    // Clear hook and retry with the EXACT same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const payment = await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });
    expect(payment.amount).toBe('200');

    const billAfterSuccess = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfterSuccess?.amountPaid.toString()).toBe('200');
  });

  it('18b. failed payment at before_commit hook rolls back transaction and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'PAY-FAIL-BEFORE-COMMIT-RETRY';

    // Inject failure at before_commit
    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'before_commit') {
        throw new Error('SIMULATED_FAILURE_BEFORE_COMMIT');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '150',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.UPI,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_BEFORE_COMMIT');

    // Confirm rollback: 0 payments in database, bill amountPaid: 0
    const paymentsAfterFail = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(paymentsAfterFail.length).toBe(0);

    const billAfterFail = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfterFail?.amountPaid.toString()).toBe('0');

    // Clear hook and retry with the EXACT same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const payment = await PaymentService.recordPayment(issued.id, {
      amount: '150',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.UPI,
      idempotencyKey: key
    });
    expect(payment.amount).toBe('150');

    const billAfterSuccess = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfterSuccess?.amountPaid.toString()).toBe('150');
  });

  it('19. failed cancellation does not leave idempotency record and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'CANCEL-FAIL-THEN-RETRY';

    // Inject failure after balance restore
    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_balance_restore') {
        throw new Error('SIMULATED_FAILURE_AFTER_BALANCE_RESTORE');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BALANCE_RESTORE');

    // Confirm rollback: bill is still ISSUED, balance remains 48
    const billAfterFail = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfterFail?.status).toBe(BillStatus.ISSUED);

    const balAfterFail = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(balAfterFail?.quantity.toString()).toBe('48');

    // Clear hook and retry with the EXACT same idempotency key
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfterSuccess = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(balAfterSuccess?.quantity.toString()).toBe('50');
  });

  // ===========================================================================
  // SECTION 6: CONTROLLED LOCK ORDERING & CONCURRENCY
  // ===========================================================================

  it('20. controlled concurrency adheres to global lock ordering without deadlocks', async () => {
    await setupStock(100, 100);
    const draft1 = await createDraftBill({ v1: '1', v2: '1' });
    const draft2 = await createDraftBill({ v1: '1', v2: '1' });

    // Concurrently issue draft1 and draft2
    const [iss1, iss2] = await Promise.all([
      BillService.issueBill(draft1.id),
      BillService.issueBill(draft2.id)
    ]);

    expect(iss1.status).toBe(BillStatus.ISSUED);
    expect(iss2.status).toBe(BillStatus.ISSUED);

    // Concurrently record payments and direct deductions
    const [p1, p2, ded] = await Promise.all([
      PaymentService.recordPayment(iss1.id, { amount: '100', paymentDate: new Date(), paymentMethod: PaymentMethod.CASH }),
      PaymentService.recordPayment(iss2.id, { amount: '100', paymentDate: new Date(), paymentMethod: PaymentMethod.UPI }),
      InventoryService.deductStock({ variantId: variant1.id, locationId: location1.id, quantity: 2 })
    ]);

    expect(p1.amount).toBe('100');
    expect(p2.amount).toBe('100');
    expect(ded.deductedQuantity).toBe('2');

    // Total variant1 deducted: 1 (bill1) + 1 (bill2) + 2 (direct) = 4
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    expect(bal1?.quantity.toString()).toBe('96'); // 100 - 4 = 96
  });

  it('21. opposing concurrent stock transfers between locations adhere to Level 8 lock order without deadlocks', async () => {
    // Setup stock at both locations: location1 = 20, location2 = 20
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } },
      create: { variantId: variant1.id, locationId: location1.id, quantity: 20, reserved: 0 },
      update: { quantity: 20, reserved: 0 }
    });
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location2.id } },
      create: { variantId: variant1.id, locationId: location2.id, quantity: 20, reserved: 0 },
      update: { quantity: 20, reserved: 0 }
    });

    // Execute concurrent opposing transfers:
    // Transfer A: location1 -> location2, quantity 5
    // Transfer B: location2 -> location1, quantity 5
    const [resA, resB] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: location1.id,
        destinationId: location2.id,
        quantity: 5,
        reference: 'OPPOSING-TRANSFER-A'
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: location2.id,
        destinationId: location1.id,
        quantity: 5,
        reference: 'OPPOSING-TRANSFER-B'
      })
    ]);

    expect(resA.transfer.status).toBe('COMPLETED');
    expect(resB.transfer.status).toBe('COMPLETED');

    // Net balance must remain exactly 20 at both locations
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location2.id } }
    });
    expect(bal1?.quantity.toString()).toBe('20');
    expect(bal2?.quantity.toString()).toBe('20');
  });

  it('22. concurrent stock transfer and bill issuance touching same location complete safely', async () => {
    // Setup location1 = 50, location2 = 10
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } },
      create: { variantId: variant1.id, locationId: location1.id, quantity: 50, reserved: 0 },
      update: { quantity: 50, reserved: 0 }
    });
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant2.id, locationId: location1.id } },
      create: { variantId: variant2.id, locationId: location1.id, quantity: 50, reserved: 0 },
      update: { quantity: 50, reserved: 0 }
    });
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location2.id } },
      create: { variantId: variant1.id, locationId: location2.id, quantity: 10, reserved: 0 },
      update: { quantity: 10, reserved: 0 }
    });

    const draft = await createDraftBill({ v1: '2', v2: '1' }, location1.id);

    // Concurrently issue bill (deducts 2 from location1) and transfer 10 from location1 to location2
    const [issueRes, transferRes] = await Promise.all([
      BillService.issueBill(draft.id),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: location1.id,
        destinationId: location2.id,
        quantity: 10,
        reference: 'CONCURRENT-ISSUE-TRANSFER'
      })
    ]);

    expect(issueRes.status).toBe(BillStatus.ISSUED);
    expect(transferRes.transfer.status).toBe('COMPLETED');

    // Balance at location1 for variant1: 50 - 2 (bill) - 10 (transfer) = 38
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    // Balance at location2 for variant1: 10 + 10 = 20
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location2.id } }
    });
    expect(bal1?.quantity.toString()).toBe('38');
    expect(bal2?.quantity.toString()).toBe('20');
  });

  // ===========================================================================
  // SECTION 7: STOCK TRANSFER IDEMPOTENCY PAYLOAD INTEGRITY
  // ===========================================================================

  it('23. stock transfer idempotency: identical retry returns original transfer without duplicate movements', async () => {
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } },
      create: { variantId: variant1.id, locationId: location1.id, quantity: 50, reserved: 0 },
      update: { quantity: 50, reserved: 0 }
    });
    const key = 'TRANSFER-IDEMPOTENT-KEY';

    const first = await InventoryService.transferStock({
      variantId: variant1.id,
      sourceId: location1.id,
      destinationId: location2.id,
      quantity: 10,
      idempotencyKey: key
    });

    const second = await InventoryService.transferStock({
      variantId: variant1.id,
      sourceId: location1.id,
      destinationId: location2.id,
      quantity: 10,
      idempotencyKey: key
    });

    expect(second.transfer.id).toBe(first.transfer.id);

    // Verify stock only moved ONCE
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } }
    });
    const bal2 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location2.id } }
    });
    expect(bal1?.quantity.toString()).toBe('40');
    expect(bal2?.quantity.toString()).toBe('10');

    const movements = await prisma.stockMovement.findMany({
      where: { transferId: first.transfer.id }
    });
    expect(movements.length).toBe(2); // exactly 1 TRANSFER_OUT and 1 TRANSFER_IN
  });

  it('24. stock transfer idempotency: changed quantity returns ConflictError', async () => {
    await prisma.inventoryBalance.upsert({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location1.id } },
      create: { variantId: variant1.id, locationId: location1.id, quantity: 50, reserved: 0 },
      update: { quantity: 50, reserved: 0 }
    });
    const key = 'TRANSFER-PAYLOAD-MISMATCH-KEY';

    await InventoryService.transferStock({
      variantId: variant1.id,
      sourceId: location1.id,
      destinationId: location2.id,
      quantity: 10,
      idempotencyKey: key
    });

    await expect(
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: location1.id,
        destinationId: location2.id,
        quantity: 15, // Changed quantity
        idempotencyKey: key
      })
    ).rejects.toThrow(ConflictError);
  });
});

