import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { locationUpdateSchema } from '@/features/inventory/inventory.validation';
import { toSafeLocation } from '@/features/inventory/inventory.utils';

export const GET = withApiWrapper(async (req, { params }) => {
  await requirePermission('inventory:read');
  const location = await InventoryService.getLocation(params.id);
  return NextResponse.json({ location: toSafeLocation(location) });
});

export const PATCH = withApiWrapper(async (req, { params }) => {
  await requirePermission('inventory:locations:manage');
  const body = await req.json();
  const data = locationUpdateSchema.parse(body);
  const location = await InventoryService.updateLocation(params.id, data);
  return NextResponse.json({ location: toSafeLocation(location) });
});
