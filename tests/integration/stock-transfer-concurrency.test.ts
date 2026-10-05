/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { BillService } from '../../src/features/billing/bill.service';
import { InventoryService } from '../../src/features/inventory/inventory.service';
import { ConflictError } from '../../src/lib/errors';
import { BillStatus, TransferStatus } from '@prisma/client';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Phase 6.4.3.2.3 — Stock-Transfer Concurrency & Concurrency Boundaries', () => {
  let locationA: any;
  let locationB: any;
  let locationC: any;
  let category: any;
  let product: any;
  let variant1: any;
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
        name: 'Transfer Concurrency Customer',
        phoneNumber: '9666655555',
        isActive: true
      }
    });

    category = await prisma.category.create({ data: { name: 'Transfer Test Category' } });
    product = await prisma.product.create({
      data: { name: 'Transfer Test Product', categoryId: category.id, isActive: true }
    });
    variant1 = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'TRANSFER-SKU-01', sellingPrice: 150, isActive: true }
    });

    locationA = await prisma.inventoryLocation.create({
      data: { code: 'LOC-A', name: 'Location A', isActive: true, isDefault: true }
    });
    locationB = await prisma.inventoryLocation.create({
      data: { code: 'LOC-B', name: 'Location B', isActive: true, isDefault: false }
    });
    locationC = await prisma.inventoryLocation.create({
      data: { code: 'LOC-C', name: 'Location C', isActive: true, isDefault: false }
    });
  });

  afterAll(async () => {
    BillService.__setBillTestHook(null);

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

    await prisma.payment.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.stockTransfer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
  });

  async function createDraftBill(qty = '5', locId = locationA.id) {
    return BillService.createBill({
      customerId: customer.id,
      locationId: locId,
      issueDate: new Date(),
      lines: [
        {
          variantId: variant1.id,
          productSnapshot: 'Transfer Test Product Line',
          quantity: qty,
          unitRate: '150',
          discountAmount: '0',
          taxRate: '0'
        }
      ]
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Opposing transfers between locations A -> B and B -> A
  // ---------------------------------------------------------------------------
  it('1. opposing transfers A -> B and B -> A complete without deadlock', async () => {
    await prisma.inventoryBalance.createMany({
      data: [
        { variantId: variant1.id, locationId: locationA.id, quantity: 20, reserved: 0 },
        { variantId: variant1.id, locationId: locationB.id, quantity: 20, reserved: 0 }
      ]
    });

    const [t1, t2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 5,
        reference: 'OPPOSING-A-TO-B'
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationB.id,
        destinationId: locationA.id,
        quantity: 5,
        reference: 'OPPOSING-B-TO-A'
      })
    ]);

    expect(t1.transfer.status).toBe(TransferStatus.COMPLETED);
    expect(t2.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('20');
    expect(balB?.quantity.toString()).toBe('20');
  });

  // ---------------------------------------------------------------------------
  // 2. Multiple concurrent transfers from the same source
  // ---------------------------------------------------------------------------
  it('2. multiple concurrent transfers from same source complete safely', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 30, reserved: 0 }
    });

    const [t1, t2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        reference: 'SOURCE-CONCURRENT-B'
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationC.id,
        quantity: 10,
        reference: 'SOURCE-CONCURRENT-C'
      })
    ]);

    expect(t1.transfer.status).toBe(TransferStatus.COMPLETED);
    expect(t2.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    const balC = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationC.id } }
    });
    expect(balA?.quantity.toString()).toBe('10'); // 30 - 10 - 10 = 10
    expect(balB?.quantity.toString()).toBe('10');
    expect(balC?.quantity.toString()).toBe('10');
  });

  // ---------------------------------------------------------------------------
  // 3. Multiple concurrent transfers into the same destination
  // ---------------------------------------------------------------------------
  it('3. multiple concurrent transfers into same destination complete safely', async () => {
    await prisma.inventoryBalance.createMany({
      data: [
        { variantId: variant1.id, locationId: locationA.id, quantity: 20, reserved: 0 },
        { variantId: variant1.id, locationId: locationB.id, quantity: 20, reserved: 0 }
      ]
    });

    const [t1, t2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationC.id,
        quantity: 10,
        reference: 'DEST-CONCURRENT-FROM-A'
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationB.id,
        destinationId: locationC.id,
        quantity: 10,
        reference: 'DEST-CONCURRENT-FROM-B'
      })
    ]);

    expect(t1.transfer.status).toBe(TransferStatus.COMPLETED);
    expect(t2.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    const balC = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationC.id } }
    });
    expect(balA?.quantity.toString()).toBe('10');
    expect(balB?.quantity.toString()).toBe('10');
    expect(balC?.quantity.toString()).toBe('20'); // 0 + 10 + 10 = 20
  });

  // ---------------------------------------------------------------------------
  // 4. Transfers where both balance rows already exist
  // ---------------------------------------------------------------------------
  it('4. transfers when both balance rows already exist', async () => {
    await prisma.inventoryBalance.createMany({
      data: [
        { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 },
        { variantId: variant1.id, locationId: locationB.id, quantity: 20, reserved: 0 }
      ]
    });

    const res = await InventoryService.transferStock({
      variantId: variant1.id,
      sourceId: locationA.id,
      destinationId: locationB.id,
      quantity: 15
    });

    expect(res.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('35');
    expect(balB?.quantity.toString()).toBe('35');
  });

  // ---------------------------------------------------------------------------
  // 5. Transfers where one balance row does not exist (destination missing)
  // ---------------------------------------------------------------------------
  it('5. transfers when destination balance row does not exist initializes it atomically', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 40, reserved: 0 }
    });

    const res = await InventoryService.transferStock({
      variantId: variant1.id,
      sourceId: locationA.id,
      destinationId: locationB.id,
      quantity: 15
    });

    expect(res.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('25');
    expect(balB?.quantity.toString()).toBe('15');
  });

  // ---------------------------------------------------------------------------
  // 6. Transfers where neither balance row exists
  // ---------------------------------------------------------------------------
  it('6. transfers when neither balance row exists rejects safely without partial records', async () => {
    await expect(
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10
      })
    ).rejects.toThrow(ConflictError);

    // Assert complete rollback: 0 movements, 0 transfers
    const movements = await prisma.stockMovement.findMany();
    expect(movements.length).toBe(0);

    const transfers = await prisma.stockTransfer.findMany();
    expect(transfers.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrent creation of the same missing balance pair
  // ---------------------------------------------------------------------------
  it('7. concurrent creation of same missing destination balance pair succeeds without P2002 conflict', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });

    // Destination locationB does NOT have a balance row yet!
    // Two workers attempt to transfer concurrently to locationB
    const [t1, t2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        reference: 'MISSING-PAIR-1'
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 15,
        reference: 'MISSING-PAIR-2'
      })
    ]);

    expect(t1.transfer.status).toBe(TransferStatus.COMPLETED);
    expect(t2.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('25'); // 50 - 10 - 15 = 25
    expect(balB?.quantity.toString()).toBe('25'); // 0 + 10 + 15 = 25
  });

  // ---------------------------------------------------------------------------
  // 8. Transfers racing with bill issuance
  // ---------------------------------------------------------------------------
  it('8. transfers racing with bill issuance on same location serialize cleanly', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });

    const draft = await createDraftBill('5', locationA.id);

    // Concurrently issue bill (deducts 5 from locationA) and transfer 10 from locationA to locationB
    const [issueRes, transferRes] = await Promise.all([
      BillService.issueBill(draft.id),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        reference: 'TRANSFER-RACING-ISSUE'
      })
    ]);

    expect(issueRes.status).toBe(BillStatus.ISSUED);
    expect(transferRes.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('35'); // 50 - 5 - 10 = 35
    expect(balB?.quantity.toString()).toBe('10');
  });

  // ---------------------------------------------------------------------------
  // 9. Transfers racing with bill cancellation and stock restoration
  // ---------------------------------------------------------------------------
  it('9. transfers racing with bill cancellation on same location serialize cleanly', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });

    const draft = await createDraftBill('5', locationA.id);
    const issued = await BillService.issueBill(draft.id); // Deducts 5 -> balance at locationA is 45

    // Concurrently cancel bill (restores 5 to locationA) and transfer 10 from locationA to locationB
    const [cancelRes, transferRes] = await Promise.all([
      BillService.cancelBill(issued.id),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        reference: 'TRANSFER-RACING-CANCEL'
      })
    ]);

    expect(cancelRes.status).toBe(BillStatus.CANCELLED);
    expect(transferRes.transfer.status).toBe(TransferStatus.COMPLETED);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('40'); // 45 + 5 - 10 = 40
    expect(balB?.quantity.toString()).toBe('10');
  });

  // ---------------------------------------------------------------------------
  // 10. Concurrent transfers with same idempotency key and identical payload
  // ---------------------------------------------------------------------------
  it('10. concurrent transfers with same idempotency key and identical payload apply exactly once', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });
    const key = 'CONCURRENT-IDENTICAL-TRANSFER-KEY';

    const [res1, res2] = await Promise.all([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        idempotencyKey: key
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        idempotencyKey: key
      })
    ]);

    expect(res1.transfer.id).toBe(res2.transfer.id);

    const balA = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const balB = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(balA?.quantity.toString()).toBe('40'); // Only deducted once
    expect(balB?.quantity.toString()).toBe('10');

    const movements = await prisma.stockMovement.findMany({
      where: { transferId: res1.transfer.id }
    });
    expect(movements.length).toBe(2); // exactly 1 TRANSFER_OUT and 1 TRANSFER_IN
  });

  // ---------------------------------------------------------------------------
  // 11. Concurrent transfers with same idempotency key but different payloads
  // ---------------------------------------------------------------------------
  it('11. concurrent transfers with same idempotency key but different payloads accept at most one', async () => {
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationA.id, quantity: 50, reserved: 0 }
    });
    const key = 'CONCURRENT-CONFLICTING-TRANSFER-KEY';

    const results = await Promise.allSettled([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 10,
        idempotencyKey: key
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 20, // Different quantity!
        idempotencyKey: key
      })
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ConflictError);

    // Exactly 1 transfer and 2 movements created
    const transfers = await prisma.stockTransfer.findMany();
    expect(transfers.length).toBe(1);

    const movements = await prisma.stockMovement.findMany();
    expect(movements.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 12. Transfer when destination balance exists but source balance is missing
  // ---------------------------------------------------------------------------
  it('12. transfer when destination balance exists but source balance is missing fails safely with rollback', async () => {
    // Destination B has 20 units, Source A has no record at all in InventoryBalance
    await prisma.inventoryBalance.create({
      data: { variantId: variant1.id, locationId: locationB.id, quantity: 20, reserved: 0 }
    });

    await expect(
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 5
      })
    ).rejects.toThrow(ConflictError);

    // Destination balance remains exactly 20
    const destBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(destBal?.quantity.toString()).toBe('20');

    // No source balance was committed
    const srcBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    expect(srcBal).toBeNull();

    // Zero movements or transfers created
    const movements = await prisma.stockMovement.findMany();
    expect(movements.length).toBe(0);
    const transfers = await prisma.stockTransfer.findMany();
    expect(transfers.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 13. Transfer when both source and destination balances are missing
  // ---------------------------------------------------------------------------
  it('13. transfer when both source and destination balances are missing fails safely with rollback', async () => {
    // Neither A nor B has an inventory balance row
    await expect(
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 5
      })
    ).rejects.toThrow(ConflictError);

    // Neither balance was committed
    const srcBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationA.id } }
    });
    const destBal = await prisma.inventoryBalance.findUnique({
      where: { variantId_locationId: { variantId: variant1.id, locationId: locationB.id } }
    });
    expect(srcBal).toBeNull();
    expect(destBal).toBeNull();

    // Zero movements or transfers created
    const movements = await prisma.stockMovement.findMany();
    expect(movements.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 14. Concurrent transfers from missing source balance fail safely
  // ---------------------------------------------------------------------------
  it('14. concurrent transfers from missing source balance both fail safely without orphaned state', async () => {
    const results = await Promise.allSettled([
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationB.id,
        quantity: 5
      }),
      InventoryService.transferStock({
        variantId: variant1.id,
        sourceId: locationA.id,
        destinationId: locationC.id,
        quantity: 5
      })
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');

    // Neither balance committed
    const allBalances = await prisma.inventoryBalance.findMany({
      where: { variantId: variant1.id }
    });
    expect(allBalances.length).toBe(0);

    const movements = await prisma.stockMovement.findMany();
    expect(movements.length).toBe(0);
  });
});
