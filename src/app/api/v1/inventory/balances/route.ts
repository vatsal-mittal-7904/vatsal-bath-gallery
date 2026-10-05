import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { paginationSchema } from '@/features/inventory/inventory.validation';
import { toSafeBalance } from '@/features/inventory/inventory.utils';

export const GET = withApiWrapper(async (req) => {
  await requirePermission('inventory:read');
  const { searchParams } = new URL(req.url);
  const { page, limit } = paginationSchema.parse({ page: searchParams.get('page'), limit: searchParams.get('limit') });
  
  const locationId = searchParams.get('locationId') || undefined;
  const variantId = searchParams.get('variantId') || undefined;

  const result = await InventoryService.getBalances({ locationId, variantId }, page, limit);
  return NextResponse.json({ items: result.items.map(toSafeBalance), total: result.total });
});
