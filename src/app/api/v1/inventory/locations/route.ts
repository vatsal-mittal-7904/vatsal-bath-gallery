import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { locationSchema, paginationSchema } from '@/features/inventory/inventory.validation';
import { toSafeLocation } from '@/features/inventory/inventory.utils';

export const GET = withApiWrapper(async (req) => {
  await requirePermission('inventory:read');
  const { searchParams } = new URL(req.url);
  const { page, limit } = paginationSchema.parse({ page: searchParams.get('page'), limit: searchParams.get('limit') });
  const isActive = searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined;

  const result = await InventoryService.getLocations(page, limit, isActive);
  return NextResponse.json({ items: result.items.map(toSafeLocation), total: result.total });
});

export const POST = withApiWrapper(async (req) => {
  await requirePermission('inventory:locations:manage');
  const body = await req.json();
  const data = locationSchema.parse(body);

  const location = await InventoryService.createLocation(data);
  return NextResponse.json({ location: toSafeLocation(location) }, { status: 201 });
});
