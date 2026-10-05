import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';

export const POST = withApiWrapper(async (req, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  await requirePermission('inventory:locations:manage');
  const { id } = await params;
  await InventoryService.archiveLocation(id);
  return NextResponse.json({ success: true });
});
