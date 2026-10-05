import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { getAuthenticatedUser, requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { stockTransferSchema } from '@/features/inventory/inventory.validation';

export const POST = withApiWrapper(async (req) => {
  await requirePermission('inventory:transfer:manage');
  const user = await getAuthenticatedUser();
  const body = await req.json();
  const data = stockTransferSchema.parse(body);

  const result = await InventoryService.transferStock({ ...data, userId: user!.id });
  return NextResponse.json({ transferId: result.transfer.id }, { status: 201 });
});
