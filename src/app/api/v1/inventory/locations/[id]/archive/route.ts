import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';

export const POST = withApiWrapper(async (req, { params }) => {
  await requirePermission('inventory:locations:manage');
  await InventoryService.archiveLocation(params.id);
  return NextResponse.json({ success: true });
});
