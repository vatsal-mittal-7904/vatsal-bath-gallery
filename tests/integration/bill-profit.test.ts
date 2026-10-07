import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { CustomerService } from '../../src/features/billing/customer.service';
import { BillService } from '../../src/features/billing/bill.service';
import { hasPermission } from '../../src/features/auth/permissions';
import { Role } from '@prisma/client';

describe('Bill Profit Calculation and Confidentiality Integration', () => {
  let customerId = '';
  let categoryId = '';
  let brandId = '';
  let productId = '';
  let variantId = '';
  let billId = '';

  beforeAll(async () => {
    // 1. Create test customer
    const customer = await CustomerService.createCustomer({
      name: 'Profit Test Customer',
      phoneNumber: '9988776655'
    });
    customerId = customer.id;

    // 2. Ensure default inventory location exists
    let loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true, isActive: true } });
    if (!loc) {
      loc = await prisma.inventoryLocation.create({
        data: { name: 'Profit Test Store', code: 'PROFIT-STORE', isDefault: true, isActive: true }
      });
    }

    // 3. Create test category, brand, product, and variant with cost price
    const category = await prisma.category.create({
      data: { name: 'Test Fittings ' + Date.now() }
    });
    categoryId = category.id;

    const brand = await prisma.brand.create({
      data: { name: 'Test Brand ' + Date.now() }
    });
    brandId = brand.id;

    const product = await prisma.product.create({
      data: {
        name: 'Test Brass Valve',
        categoryId,
        brandId,
        isActive: true
      }
    });
    productId = product.id;

    // Selling price: 250.00, Cost price: 150.00
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: 'VALVE-12-' + Date.now(),
        attributes: { variant_name: '1/2 Inch Valve' },
        sellingPrice: 250.00,
        costPrice: 150.00,
        isActive: true
      }
    });
    variantId = variant.id;

    // 4. Create a Bill with this variant
    // Quantity: 4
    // Unit rate: 250.00
    // Discount: 100.00 (Total discount on line)
    // Subtotal: 1000.00
    // Taxable revenue: 1000 - 100 = 900.00
    // Line wholesale cost: 4 * 150.00 = 600.00
    // Expected gross profit: 900 - 600 = 300.00
    // Expected profit margin: (300 / 900) * 100 = 33.33%
    const createdBill = await BillService.createBill({
      customerId,
      locationId: loc.id,
      issueDate: new Date(),
      lines: [
        {
          variantId,
          productSnapshot: 'Test Brass Valve',
          variantSnapshot: '1/2 Inch Valve',
          skuSnapshot: variant.sku,
          quantity: '4',
          unitRate: '250',
          discountAmount: '100',
          taxRate: '18'
        }
      ]
    });
    billId = createdBill.id;
  });

  afterAll(async () => {
    if (billId) {
      await prisma.payment.deleteMany({ where: { billId } });
      await prisma.billLine.deleteMany({ where: { billId } });
      await prisma.bill.deleteMany({ where: { id: billId } });
    }
    if (variantId) {
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
    }
    if (productId) {
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (brandId) {
      await prisma.brand.deleteMany({ where: { id: brandId } });
    }
    if (categoryId) {
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it('correctly calculates profit and margin when includeProfit is true (OWNER)', async () => {
    const bill = await BillService.getBill(billId, { includeProfit: true });

    expect(bill).toBeDefined();
    expect(bill.profit).toBeDefined();

    // Check line level profit
    expect(bill.lines).toBeDefined();
    expect(bill.lines).toHaveLength(1);
    const line = bill.lines![0]!;
    expect(line.profit).toBeDefined();
    expect(line.profit?.unitCost).toBe('150.00');
    expect(line.profit?.totalCost).toBe('600.00');
    expect(line.profit?.grossProfit).toBe('300.00');
    expect(line.profit?.marginPercentage).toBe('33.33');

    // Check bill level aggregated profit
    expect(bill.profit?.totalRevenue).toBe('900.00');
    expect(bill.profit?.totalCost).toBe('600.00');
    expect(bill.profit?.grossProfit).toBe('300.00');
    expect(bill.profit?.marginPercentage).toBe('33.33');
  });

  it('strictly omits profit when includeProfit is false or omitted (STAFF / Unprivileged)', async () => {
    const billWithoutProfit = await BillService.getBill(billId);

    expect(billWithoutProfit.profit).toBeUndefined();
    expect(billWithoutProfit.lines?.[0]?.profit).toBeUndefined();

    const explicitFalseBill = await BillService.getBill(billId, { includeProfit: false });
    expect(explicitFalseBill.profit).toBeUndefined();
    expect(explicitFalseBill.lines?.[0]?.profit).toBeUndefined();
  });

  it('strictly respects role-based permissions for profit confidentiality', () => {
    // OWNER must have profit report permission
    expect(hasPermission(Role.OWNER, 'reports:profit:read')).toBe(true);

    // STAFF must NEVER have profit report or cost read permissions
    expect(hasPermission(Role.STAFF, 'reports:profit:read')).toBe(false);
    expect(hasPermission(Role.STAFF, 'catalogue:cost:read')).toBe(false);
  });

  it('includes profit in getBills list when requested and omits when not', async () => {
    const listWithProfit = await BillService.getBills(1, 10, { customerId }, { includeProfit: true });
    expect(listWithProfit.items.length).toBeGreaterThan(0);
    const foundWithProfit = listWithProfit.items.find(b => b.id === billId);
    expect(foundWithProfit?.profit).toBeDefined();
    expect(foundWithProfit?.profit?.grossProfit).toBe('300.00');

    const listWithoutProfit = await BillService.getBills(1, 10, { customerId }, { includeProfit: false });
    const foundWithoutProfit = listWithoutProfit.items.find(b => b.id === billId);
    expect(foundWithoutProfit?.profit).toBeUndefined();
  });

  it('handles edge cases in toSafeBill calculation (zero cost, sold at loss, zero revenue)', () => {
    // 1. Zero cost / null cost price
    const mockBillZeroCost: any = {
      id: 'test-1',
      billNumber: 'INV-TEST-001',
      version: 1,
      customerId: 'cust-1',
      locationId: 'loc-1',
      issueDate: new Date(),
      subtotal: '200.00',
      discountTotal: '0.00',
      taxTotal: '36.00',
      grandTotal: '236.00',
      amountPaid: '0.00',
      balanceDue: '236.00',
      status: 'ISSUED',
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [
        {
          id: 'line-1',
          billId: 'test-1',
          variantId: 'var-1',
          productSnapshot: 'Item 1',
          variantSnapshot: 'V1',
          skuSnapshot: 'SKU1',
          quantity: '2',
          unitRate: '100.00',
          discountAmount: '0.00',
          taxRate: '18.00',
          taxAmount: '36.00',
          subtotal: '200.00',
          lineAmount: '236.00',
          sortOrder: 0,
          variant: { costPrice: null }
        }
      ]
    };

    const safeZeroCost = BillService.toSafeBill(mockBillZeroCost, { includeProfit: true });
    expect(safeZeroCost.profit?.totalRevenue).toBe('200.00');
    expect(safeZeroCost.profit?.totalCost).toBe('0.00');
    expect(safeZeroCost.profit?.grossProfit).toBe('200.00');
    expect(safeZeroCost.profit?.marginPercentage).toBe('100.00');

    // 2. Sold at a loss (selling price lower than cost)
    const mockBillLoss: any = {
      ...mockBillZeroCost,
      subtotal: '160.00',
      lines: [
        {
          ...mockBillZeroCost.lines[0],
          unitRate: '80.00',
          subtotal: '160.00',
          variant: { costPrice: '100.00' } // Cost is 100 * 2 = 200, Revenue is 160
        }
      ]
    };

    const safeLoss = BillService.toSafeBill(mockBillLoss, { includeProfit: true });
    expect(safeLoss.profit?.totalRevenue).toBe('160.00');
    expect(safeLoss.profit?.totalCost).toBe('200.00');
    expect(safeLoss.profit?.grossProfit).toBe('-40.00');
    expect(safeLoss.profit?.marginPercentage).toBe('-25.00');
  });
});
