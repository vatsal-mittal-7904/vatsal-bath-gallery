import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { BillStatus, Prisma } from '@prisma/client';
import { BillService } from '@/features/billing/bill.service';

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('reports:profit:read');
  const { searchParams } = new URL(req.url);

  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const statusParam = searchParams.get('status') as BillStatus | null;

  const where: Prisma.BillWhereInput = {};

  if (statusParam) {
    where.status = statusParam;
  } else {
    // By default, exclude cancelled bills from profit analysis
    where.status = { not: BillStatus.CANCELLED };
  }

  if (startDateParam || endDateParam) {
    where.issueDate = {};
    if (startDateParam) where.issueDate.gte = new Date(startDateParam);
    if (endDateParam) {
      const end = new Date(endDateParam);
      end.setHours(23, 59, 59, 999);
      where.issueDate.lte = end;
    }
  }

  const rawBills = await prisma.bill.findMany({
    where,
    orderBy: { issueDate: 'desc' },
    include: {
      customer: true,
      location: true,
      estimate: { select: { id: true, estimateNumber: true } },
      lines: {
        include: { variant: true },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  let totalMerchandiseRevenue = new Prisma.Decimal(0);
  let totalWholesaleCost = new Prisma.Decimal(0);

  // Product-level profitability aggregation
  const productProfitMap = new Map<string, {
    productName: string;
    variantSku: string;
    unitsSold: Prisma.Decimal;
    revenue: Prisma.Decimal;
    cost: Prisma.Decimal;
    profit: Prisma.Decimal;
  }>();

  const safeBills = rawBills.map(b => {
    const safeBill = BillService.toSafeBill(b, { includeProfit: true });

    if (safeBill.profit) {
      totalMerchandiseRevenue = totalMerchandiseRevenue.add(new Prisma.Decimal(safeBill.profit.totalRevenue));
      totalWholesaleCost = totalWholesaleCost.add(new Prisma.Decimal(safeBill.profit.totalCost));
    }

    if (safeBill.lines) {
      for (const line of safeBill.lines) {
        if (!line.profit) continue;
        const key = line.skuSnapshot || line.productSnapshot;
        const lineQty = new Prisma.Decimal(line.quantity);
        const lineRev = new Prisma.Decimal(line.subtotal).sub(new Prisma.Decimal(line.discountAmount || '0'));
        const lineCost = new Prisma.Decimal(line.profit.totalCost);
        const lineProfit = new Prisma.Decimal(line.profit.grossProfit);

        const existing = productProfitMap.get(key) || {
          productName: line.productSnapshot,
          variantSku: line.skuSnapshot || line.variantSnapshot || 'N/A',
          unitsSold: new Prisma.Decimal(0),
          revenue: new Prisma.Decimal(0),
          cost: new Prisma.Decimal(0),
          profit: new Prisma.Decimal(0),
        };

        existing.unitsSold = existing.unitsSold.add(lineQty);
        existing.revenue = existing.revenue.add(lineRev);
        existing.cost = existing.cost.add(lineCost);
        existing.profit = existing.profit.add(lineProfit);

        productProfitMap.set(key, existing);
      }
    }

    return safeBill;
  });

  const totalGrossProfit = totalMerchandiseRevenue.sub(totalWholesaleCost);
  const overallMarginPercentage = totalMerchandiseRevenue.gt(0)
    ? (totalGrossProfit.div(totalMerchandiseRevenue).mul(100)).toFixed(2)
    : '0.00';

  const productBreakdown = Array.from(productProfitMap.values())
    .map(p => ({
      productName: p.productName,
      variantSku: p.variantSku,
      unitsSold: p.unitsSold.toString(),
      revenue: p.revenue.toFixed(2),
      cost: p.cost.toFixed(2),
      profit: p.profit.toFixed(2),
      marginPercentage: p.revenue.gt(0) ? (p.profit.div(p.revenue).mul(100)).toFixed(2) : '0.00'
    }))
    .sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));

  return successResponse({
    summary: {
      totalBills: safeBills.length,
      totalRevenue: totalMerchandiseRevenue.toFixed(2),
      totalCost: totalWholesaleCost.toFixed(2),
      totalProfit: totalGrossProfit.toFixed(2),
      overallMarginPercentage
    },
    topProducts: productBreakdown.slice(0, 10),
    allProducts: productBreakdown,
    bills: safeBills
  }, 'Profit report retrieved successfully', 200, req);
});
