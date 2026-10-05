/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { PaymentService } from '../../src/features/billing/payment.service';
import { ConflictError, ValidationError } from '../../src/lib/errors';
import { BillStatus, MovementType, PaymentMethod } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3.1 — Bill/Payment/Inventory Concurrency & Idempotency Audit', () => {
  let location: any;
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
        name: 'Audit Test Customer',
        phoneNumber: '9888877777',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Audit Sanitaryware' } });
    product = await prisma.product.create({
      data: { name: 'Audit Brass Valve', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'AUDIT-VALVE-01', sellingPrice: 200, isActive: true }
    });
    variant2 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'AUDIT-VALVE-02', sellingPrice: 300, isActive: true }
    });

    location = await prisma.inventoryLocation.create({
      data: { code: 'AUDIT-LOC', name: 'Audit Warehouse', isActive: true, isDefault: true }
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
    await prisma.inventoryBalance.deleteMany();
  });

  // Helper to create a draft bill
  async function createDraftBill(quantities = { v1: '2', v2: '1' }) {
    return BillService.createBill({
      customerId: customer.id,
      locationId: location.id,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Audit Valve 1',
          quantity: quantities.v1,
          unitRate: '200',
          discountAmount: '0',
          taxRate: '0'
        },
        {
          variantId: variant2.id,
          productSnapshot: 'Audit Valve 2',
          quantity: quantities.v2,
          unitRate: '300',
          discountAmount: '0',
          taxRate: '0'
        }
      ]
    });
  }

  // Helper to setup stock
  async function setupStock(qty1 = 50, qty2 = 50) {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: location.id, quantity: qty1, reserved: 0 }
    });
    await prisma.inventoryBalance.create({
      data: { variantId: variant2.id, locationId: location.id, quantity: qty2, reserved: 0 }
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Cancellation vs Concurrent Payment Race (Cancellation locks Level 7 first)
  // ---------------------------------------------------------------------------
  it('1. cancellation vs payment race: cancellation locks first -> payment rejected with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    let paymentStarted = false;
    let paymentResult: any = null;
    let paymentError: any = null;

    // Pause cancelBill after locking Level 7 Bill to let recordPayment attempt lock
    BillService.__setBillTestHook(async (step) => {
      if (step === 'before_cancellation_restore') {
        paymentStarted = true;
        // Launch payment while cancellation transaction holds Level 7 lock
        PaymentService.recordPayment(issued.id, {
          amount: '200',
          paymentDate: new Date(),
          paymentMethod: PaymentMethod.CASH
        })
          .then((res) => { paymentResult = res; })
          .catch((err) => { paymentError = err; });

        // Small delay to ensure payment has blocked on the row lock
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });

    const cancelledBill = await BillService.cancelBill(issued.id);
    expect(cancelledBill.status).toBe(BillStatus.CANCELLED);

    // Wait for payment to finish unblocking
    while (!paymentResult && !paymentError) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(paymentStarted).toBe(true);
    expect(paymentResult).toBeNull();
    expect(paymentError).toBeInstanceOf(ConflictError);
    expect(paymentError.message).toMatch(/cancelled bill/i);

    // Verify DB integrity: 0 payments, bill CANCELLED, stock restored
    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);

    const persistedBill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(persistedBill?.status).toBe(BillStatus.CANCELLED);
    expect(persistedBill?.amountPaid.toString()).toBe('0');

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50'); // Restored
  });

  // ---------------------------------------------------------------------------
  // 2. Payment vs Concurrent Cancellation Race (Payment locks Level 7 first)
  // ---------------------------------------------------------------------------
  it('2. payment vs cancellation race: payment locks first -> cancellation rejected with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);

    let cancelResult: any = null;
    let cancelError: any = null;

    // Pause recordPayment after inserting payment while holding Level 7 lock
    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'after_payment_insert') {
        // Launch cancellation while payment holds Level 7 lock
        BillService.cancelBill(issued.id)
          .then((res) => { cancelResult = res; })
          .catch((err) => { cancelError = err; });

        // Delay to ensure cancelBill blocks on Level 7 lock
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });

    const payment = await PaymentService.recordPayment(issued.id, {
      amount: '200',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    });
    expect(payment.amount.toString()).toBe('200');

    // Wait for cancelBill to unblock and finish
    while (!cancelResult && !cancelError) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(cancelResult).toBeNull();
    expect(cancelError).toBeInstanceOf(ConflictError);
    expect(cancelError.message).toMatch(/recorded payments|existing payments/i);

    // Verify DB integrity: payment intact, bill PARTIALLY_PAID, stock deducted
    const persistedBill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(persistedBill?.status).toBe(BillStatus.PARTIALLY_PAID);
    expect(persistedBill?.amountPaid.toString()).toBe('200');

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48'); // 50 - 2 = 48 (not restored)
  });

  // ---------------------------------------------------------------------------
  // 3. Payment on DRAFT Bill Rejected
  // ---------------------------------------------------------------------------
  it('3. rejects payment recording on DRAFT bill with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    expect(draft.status).toBe(BillStatus.DRAFT);

    await expect(
      PaymentService.recordPayment(draft.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH
      })
    ).rejects.toThrow(ConflictError);

    const payments = await prisma.payment.findMany({ where: { billId: draft.id } });
    expect(payments.length).toBe(0);

    const persisted = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(persisted?.status).toBe(BillStatus.DRAFT);
  });

  // ---------------------------------------------------------------------------
  // 4. Payment on CANCELLED Bill Rejected
  // ---------------------------------------------------------------------------
  it('4. rejects payment recording on CANCELLED bill with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    await BillService.cancelBill(issued.id);

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH
      })
    ).rejects.toThrow(ConflictError);

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Payment on PAID Bill Rejected
  // ---------------------------------------------------------------------------
  it('5. rejects payment recording on fully PAID bill with ConflictError', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id); // Total: 2*200 + 1*300 = 700

    await PaymentService.recordPayment(issued.id, {
      amount: '700',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH
    });

    const paidBill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(paidBill?.status).toBe(BillStatus.PAID);

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '50',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH
      })
    ).rejects.toThrow(ConflictError);

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. Multiple Concurrent Payments Serialized on Level 7 Lock
  // ---------------------------------------------------------------------------
  it('6. serializes multiple concurrent payments without overpayment or lost updates', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id); // Total: 700

    // Two concurrent partial payments: 200 + 300 = 500 <= 700
    const [p1, p2] = await Promise.all([
      PaymentService.recordPayment(issued.id, {
        amount: '200',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'CONCURRENT-PAY-1'
      }),
      PaymentService.recordPayment(issued.id, {
        amount: '300',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.UPI,
        idempotencyKey: 'CONCURRENT-PAY-2'
      })
    ]);

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const afterTwo = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(afterTwo?.amountPaid.toString()).toBe('500');
    expect(afterTwo?.balanceDue.toString()).toBe('200');
    expect(afterTwo?.status).toBe(BillStatus.PARTIALLY_PAID);

    // Now attempt two concurrent payments of 150 each when balance is 200:
    // Exactly one should succeed and one must fail with ValidationError (exceeds balance)
    const results = await Promise.allSettled([
      PaymentService.recordPayment(issued.id, {
        amount: '150',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'CONCURRENT-PAY-3'
      }),
      PaymentService.recordPayment(issued.id, {
        amount: '150',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'CONCURRENT-PAY-4'
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const finalBill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(finalBill?.amountPaid.toString()).toBe('650');
    expect(finalBill?.balanceDue.toString()).toBe('50');
    expect(finalBill?.status).toBe(BillStatus.PARTIALLY_PAID);
  });

  // ---------------------------------------------------------------------------
  // 6b. Issuance Failure Injection: after bill lock
  // ---------------------------------------------------------------------------
  it('6b. issuance failure after bill lock leaves bill DRAFT and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const key = 'HOOK-FAIL-ISSUE-0';

    BillService.__setBillTestHook(async (step, context) => {
      if (step === 'after_bill_lock' && context?.stage === 'issue') {
        throw new Error('SIMULATED_FAILURE_AFTER_BILL_LOCK_ISSUE');
      }
    });

    await expect(
      BillService.issueBill(draft.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BILL_LOCK_ISSUE');

    const bill = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(bill?.status).toBe(BillStatus.DRAFT);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50');

    const movements = await prisma.stockMovement.findMany({ where: { reference: bill?.billNumber } });
    expect(movements.length).toBe(0);

    // Verify clean retry with same idempotency key succeeds
    BillService.__setBillTestHook(null);
    const issued = await BillService.issueBill(draft.id, { idempotencyKey: key });
    expect(issued.status).toBe(BillStatus.ISSUED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('48');
  });

  // ---------------------------------------------------------------------------
  // 7. Issuance Failure Injection: before stock deduction
  // ---------------------------------------------------------------------------
  it('7. issuance failure before stock deduction leaves bill DRAFT and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const key = 'HOOK-FAIL-ISSUE-1';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'before_stock_deduction') {
        throw new Error('SIMULATED_FAILURE_BEFORE_STOCK_DEDUCTION');
      }
    });

    await expect(
      BillService.issueBill(draft.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_BEFORE_STOCK_DEDUCTION');

    const bill = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(bill?.status).toBe(BillStatus.DRAFT);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50');

    const movements = await prisma.stockMovement.findMany({ where: { reference: bill?.billNumber } });
    expect(movements.length).toBe(0);

    // Verify clean retry with same idempotency key succeeds
    BillService.__setBillTestHook(null);
    const issued = await BillService.issueBill(draft.id, { idempotencyKey: key });
    expect(issued.status).toBe(BillStatus.ISSUED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('48');
  });

  // ---------------------------------------------------------------------------
  // 8. Issuance Failure Injection: after stock deduction
  // ---------------------------------------------------------------------------
  it('8. issuance failure after stock deduction rolls back entire transaction atomically and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const key = 'HOOK-FAIL-ISSUE-2';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_stock_deduction') {
        throw new Error('SIMULATED_FAILURE_AFTER_STOCK_DEDUCTION');
      }
    });

    await expect(
      BillService.issueBill(draft.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_STOCK_DEDUCTION');

    const bill = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(bill?.status).toBe(BillStatus.DRAFT);

    // Inventory deduction must be rolled back!
    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50');

    const movements = await prisma.stockMovement.findMany({ where: { reference: bill?.billNumber } });
    expect(movements.length).toBe(0);

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const issued = await BillService.issueBill(draft.id, { idempotencyKey: key });
    expect(issued.status).toBe(BillStatus.ISSUED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('48');
  });

  // ---------------------------------------------------------------------------
  // 9. Issuance Failure Injection: after bill status update
  // ---------------------------------------------------------------------------
  it('9. issuance failure after bill status update rolls back status and inventory and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const key = 'HOOK-FAIL-ISSUE-3';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_bill_status_update') {
        throw new Error('SIMULATED_FAILURE_AFTER_BILL_STATUS_UPDATE');
      }
    });

    await expect(
      BillService.issueBill(draft.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BILL_STATUS_UPDATE');

    const bill = await prisma.bill.findUnique({ where: { id: draft.id } });
    expect(bill?.status).toBe(BillStatus.DRAFT);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('50');

    const movements = await prisma.stockMovement.findMany({ where: { reference: bill?.billNumber } });
    expect(movements.length).toBe(0);

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const issued = await BillService.issueBill(draft.id, { idempotencyKey: key });
    expect(issued.status).toBe(BillStatus.ISSUED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('48');
  });

  // ---------------------------------------------------------------------------
  // 9b. Cancellation Failure Injection: after bill lock
  // ---------------------------------------------------------------------------
  it('9b. cancellation failure after bill lock leaves bill ISSUED and stock untouched and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-CANCEL-0';

    BillService.__setBillTestHook(async (step, context) => {
      if (step === 'after_bill_lock' && context?.stage === 'cancel') {
        throw new Error('SIMULATED_FAILURE_AFTER_BILL_LOCK_CANCEL');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BILL_LOCK_CANCEL');

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48'); // Still deducted

    const cancelMovements = await prisma.stockMovement.findMany({
      where: { reference: { startsWith: 'CANCEL:' } }
    });
    expect(cancelMovements.length).toBe(0);

    // Clean retry with same idempotency key succeeds
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('50'); // Restored
  });

  // ---------------------------------------------------------------------------
  // 10. Cancellation Failure Injection: before cancellation restore
  // ---------------------------------------------------------------------------
  it('10. cancellation failure before restore leaves bill ISSUED and stock untouched and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-CANCEL-1';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'before_cancellation_restore') {
        throw new Error('SIMULATED_FAILURE_BEFORE_CANCELLATION_RESTORE');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_BEFORE_CANCELLATION_RESTORE');

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48'); // Deducted quantity remains

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('50'); // Restored
  });

  // ---------------------------------------------------------------------------
  // 11. Cancellation Failure Injection: after balance restore
  // ---------------------------------------------------------------------------
  it('11. cancellation failure after balance restore rolls back entire transaction atomically and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-CANCEL-2';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_balance_restore') {
        throw new Error('SIMULATED_FAILURE_AFTER_BALANCE_RESTORE');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BALANCE_RESTORE');

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48'); // Restored quantity rolled back

    const cancelMovements = await prisma.stockMovement.findMany({
      where: { reference: { startsWith: 'CANCEL:' } }
    });
    expect(cancelMovements.length).toBe(0);

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('50');
  });

  // ---------------------------------------------------------------------------
  // 12. Cancellation Failure Injection: after restoration movement
  // ---------------------------------------------------------------------------
  it('12. cancellation failure after restoration movement rolls back entire transaction and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-CANCEL-3';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_restoration_movement') {
        throw new Error('SIMULATED_FAILURE_AFTER_RESTORATION_MOVEMENT');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_RESTORATION_MOVEMENT');

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48');

    const cancelMovements = await prisma.stockMovement.findMany({
      where: { reference: { startsWith: 'CANCEL:' } }
    });
    expect(cancelMovements.length).toBe(0);

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('50');
  });

  // ---------------------------------------------------------------------------
  // 13. Cancellation Failure Injection: after bill status update
  // ---------------------------------------------------------------------------
  it('13. cancellation failure after bill status update rolls back status and restored inventory and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-CANCEL-4';

    BillService.__setBillTestHook(async (step) => {
      if (step === 'after_bill_status_update') {
        throw new Error('SIMULATED_FAILURE_AFTER_BILL_STATUS_UPDATE');
      }
    });

    await expect(
      BillService.cancelBill(issued.id, { idempotencyKey: key })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BILL_STATUS_UPDATE');

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);

    const bal1 = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1?.quantity.toString()).toBe('48');

    // Clean retry with same idempotency key
    BillService.__setBillTestHook(null);
    const cancelled = await BillService.cancelBill(issued.id, { idempotencyKey: key });
    expect(cancelled.status).toBe(BillStatus.CANCELLED);

    const balAfter = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(balAfter?.quantity.toString()).toBe('50');
  });

  // ---------------------------------------------------------------------------
  // 14. Payment Failure Injection: after bill lock
  // ---------------------------------------------------------------------------
  it('14. payment failure after bill lock creates no payment and leaves bill intact and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-PAY-1';

    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'after_bill_lock') {
        throw new Error('SIMULATED_FAILURE_AFTER_BILL_LOCK');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_BILL_LOCK');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);
    expect(bill?.amountPaid.toString()).toBe('0');

    // Clean retry with same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const p = await PaymentService.recordPayment(issued.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });
    expect(p.amount).toBe('100');

    const billAfter = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfter?.amountPaid.toString()).toBe('100');
  });

  // ---------------------------------------------------------------------------
  // 14b. Payment Failure Injection: before payment insert
  // ---------------------------------------------------------------------------
  it('14b. payment failure before payment insert creates no payment and subsequent retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-PAY-1B';

    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'before_payment_insert') {
        throw new Error('SIMULATED_FAILURE_BEFORE_PAYMENT_INSERT');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_BEFORE_PAYMENT_INSERT');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);
    expect(bill?.amountPaid.toString()).toBe('0');

    // Clean retry with same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const p = await PaymentService.recordPayment(issued.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });
    expect(p.amount).toBe('100');

    const billAfter = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfter?.amountPaid.toString()).toBe('100');
  });

  // ---------------------------------------------------------------------------
  // 15. Payment Failure Injection: after payment insert
  // ---------------------------------------------------------------------------
  it('15. payment failure after payment insert rolls back payment and bill totals and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-PAY-2';

    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'after_payment_insert') {
        throw new Error('SIMULATED_FAILURE_AFTER_PAYMENT_INSERT');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_AFTER_PAYMENT_INSERT');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);
    expect(bill?.amountPaid.toString()).toBe('0');

    // Clean retry with same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const p = await PaymentService.recordPayment(issued.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });
    expect(p.amount).toBe('100');

    const billAfter = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfter?.amountPaid.toString()).toBe('100');
  });

  // ---------------------------------------------------------------------------
  // 15b. Payment Failure Injection: before commit
  // ---------------------------------------------------------------------------
  it('15b. payment failure at before_commit rolls back payment and bill totals and retry succeeds', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();
    const issued = await BillService.issueBill(draft.id);
    const key = 'HOOK-FAIL-PAY-3';

    PaymentService.__setPaymentTestHook(async (step) => {
      if (step === 'before_commit') {
        throw new Error('SIMULATED_FAILURE_BEFORE_COMMIT');
      }
    });

    await expect(
      PaymentService.recordPayment(issued.id, {
        amount: '100',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key
      })
    ).rejects.toThrow('SIMULATED_FAILURE_BEFORE_COMMIT');

    const payments = await prisma.payment.findMany({ where: { billId: issued.id } });
    expect(payments.length).toBe(0);

    const bill = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(bill?.status).toBe(BillStatus.ISSUED);
    expect(bill?.amountPaid.toString()).toBe('0');

    // Clean retry with same idempotency key
    PaymentService.__setPaymentTestHook(null);
    const p = await PaymentService.recordPayment(issued.id, {
      amount: '100',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: key
    });
    expect(p.amount).toBe('100');

    const billAfter = await prisma.bill.findUnique({ where: { id: issued.id } });
    expect(billAfter?.amountPaid.toString()).toBe('100');
  });

  // ---------------------------------------------------------------------------
  // 16. Direct and Generic Status Update Bypasses Rejected
  // ---------------------------------------------------------------------------
  it('16. rejects direct status tampering via updateBill and updateStatus', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();

    // Rejection of lifecycle statuses via generic updateBill
    await expect(
      BillService.updateBill(draft.id, { status: BillStatus.ISSUED } as any)
    ).rejects.toThrow(ValidationError);

    await expect(
      BillService.updateBill(draft.id, { status: BillStatus.CANCELLED } as any)
    ).rejects.toThrow(ValidationError);

    await expect(
      BillService.updateBill(draft.id, { status: BillStatus.PAID } as any)
    ).rejects.toThrow(ValidationError);

    await expect(
      BillService.updateBill(draft.id, { status: BillStatus.PARTIALLY_PAID } as any)
    ).rejects.toThrow(ValidationError);

    // Rejection of invalid status transitions via updateStatus
    await expect(
      BillService.updateStatus(draft.id, BillStatus.PAID)
    ).rejects.toThrow(ValidationError);

    await expect(
      BillService.updateStatus(draft.id, BillStatus.PARTIALLY_PAID)
    ).rejects.toThrow(ValidationError);

    // Cannot revert non-draft to DRAFT
    const issuedForStatusTest = await BillService.issueBill(draft.id);
    await expect(
      BillService.updateStatus(issuedForStatusTest.id, BillStatus.DRAFT)
    ).rejects.toThrow(ConflictError);

    // Calling updateStatus with ISSUED properly triggers inventory deduction (delegates to issueBill)
    const anotherDraft = await createDraftBill();
    const issuedViaUpdateStatus = await BillService.updateStatus(anotherDraft.id, BillStatus.ISSUED);
    expect(issuedViaUpdateStatus.status).toBe(BillStatus.ISSUED);
    const movs = await prisma.stockMovement.findMany({
      where: { billId: anotherDraft.id, type: MovementType.ISSUE }
    });
    expect(movs.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 17. Replay / Cross-Entity Idempotency Collision Rejection
  // ---------------------------------------------------------------------------
  it('17. rejects cross-entity idempotency key reuse with ConflictError', async () => {
    await setupStock(50, 50);
    const draft1 = await createDraftBill();
    const draft2 = await createDraftBill();

    const issued1 = await BillService.issueBill(draft1.id, { idempotencyKey: 'IDEM-KEY-SHARED-1' });
    expect(issued1.status).toBe(BillStatus.ISSUED);

    // 17a. Reusing idempotency key for another bill's cancelBill
    await expect(
      BillService.cancelBill(draft2.id, { idempotencyKey: 'IDEM-KEY-SHARED-1' })
    ).rejects.toThrow(ConflictError);

    // 17b. Reusing idempotency key for another bill's issueBill
    await expect(
      BillService.issueBill(draft2.id, { idempotencyKey: 'IDEM-KEY-SHARED-1' })
    ).rejects.toThrow(ConflictError);

    // 17c. Reusing idempotency key across different payments
    const p1 = await PaymentService.recordPayment(issued1.id, {
      amount: '50',
      paymentDate: new Date(),
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: 'PAY-KEY-SHARED-1'
    });
    expect(p1.amount.toString()).toBe('50');

    const issued2 = await BillService.issueBill(draft2.id);
    await expect(
      PaymentService.recordPayment(issued2.id, {
        amount: '50',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'PAY-KEY-SHARED-1'
      })
    ).rejects.toThrow(ConflictError);

    // 17d. Reusing movement idempotency key for a payment
    await expect(
      PaymentService.recordPayment(issued2.id, {
        amount: '50',
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'IDEM-KEY-SHARED-1'
      })
    ).rejects.toThrow(ConflictError);
  });

  // ---------------------------------------------------------------------------
  // 18. Concurrent Idempotent Replays
  // ---------------------------------------------------------------------------
  it('18. handles concurrent identical idempotent requests safely without duplicate side-effects', async () => {
    await setupStock(50, 50);
    const draft = await createDraftBill();

    // 18a. Concurrent issueBill with identical idempotencyKey
    const [iss1, iss2] = await Promise.all([
      BillService.issueBill(draft.id, { idempotencyKey: 'CONCURRENT-ISSUE-KEY' }),
      BillService.issueBill(draft.id, { idempotencyKey: 'CONCURRENT-ISSUE-KEY' })
    ]);

    expect(iss1.status).toBe(BillStatus.ISSUED);
    expect(iss2.status).toBe(BillStatus.ISSUED);

    // Verify stock deducted ONLY once (50 - 2 = 48)
    const bal1AfterIssue = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: location.id } }
    });
    expect(bal1AfterIssue?.quantity.toString()).toBe('48');

    const issueMovements = await prisma.stockMovement.findMany({
      where: { reference: iss1.billNumber, type: MovementType.ISSUE }
    });
    expect(issueMovements.length).toBe(2); // 1 movement per line, NOT 4!

    // 18b. Concurrent recordPayment with identical idempotencyKey
    const sharedPaymentDate = new Date('2026-10-04T10:00:00.000Z');
    const [p1, p2] = await Promise.all([
      PaymentService.recordPayment(iss1.id, {
        amount: '100',
        paymentDate: sharedPaymentDate,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'CONCURRENT-PAY-KEY'
      }),
      PaymentService.recordPayment(iss1.id, {
        amount: '100',
        paymentDate: sharedPaymentDate,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: 'CONCURRENT-PAY-KEY'
      })
    ]);

    expect(p1.id).toBe(p2.id); // Replayed the exact payment

    const payments = await prisma.payment.findMany({ where: { billId: iss1.id } });
    expect(payments.length).toBe(1); // Exactly 1 payment recorded

    const billAfterPay = await prisma.bill.findUnique({ where: { id: iss1.id } });
    expect(billAfterPay?.amountPaid.toString()).toBe('100'); // NOT 200

    // 18c. Concurrent cancelBill with identical idempotencyKey
    const draftToCancel = await createDraftBill();
    const issuedToCancel = await BillService.issueBill(draftToCancel.id);

    const [can1, can2] = await Promise.all([
      BillService.cancelBill(issuedToCancel.id, { idempotencyKey: 'CONCURRENT-CANCEL-KEY' }),
      BillService.cancelBill(issuedToCancel.id, { idempotencyKey: 'CONCURRENT-CANCEL-KEY' })
    ]);

    expect(can1.status).toBe(BillStatus.CANCELLED);
    expect(can2.status).toBe(BillStatus.CANCELLED);

    const cancelMovements = await prisma.stockMovement.findMany({
      where: { billId: issuedToCancel.id, type: MovementType.POSITIVE_ADJUSTMENT }
    });
    expect(cancelMovements.length).toBe(2); // Exactly 1 restoration per line, NOT 4!
  });
});
