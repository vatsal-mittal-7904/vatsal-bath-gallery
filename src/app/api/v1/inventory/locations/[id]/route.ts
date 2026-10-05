import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { locationUpdateSchema } from '@/features/inventory/inventory.validation';
import { toSafeLocation } from '@/features/inventory/inventory.utils';

export const GET = withApiWrapper(async (req, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('inventory:read');
  const { id } = await params;
  const location = await InventoryService.getLocation(id);
  return NextResponse.json({ location: toSafeLocation(location) });
});

export const PATCH = withApiWrapper(async (req, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('inventory:locations:manage');
  const { id } = await params;
  const body = await req.json();
  const data = locationUpdateSchema.parse(body);
  const location = await InventoryService.updateLocation(id, data);
  return NextResponse.json({ location: toSafeLocation(location) });
});
