import { NextResponse } from 'next/server';
import { withApiWrapper } from '@/lib/api-wrapper';
import { getAuthenticatedUser, requirePermission } from '@/features/auth/auth.guard';
import { InventoryService } from '@/features/inventory/inventory.service';
import { stockReceiptSchema } from '@/features/inventory/inventory.validation';
import { toSafeBalance, toSafeMovement } from '@/features/inventory/inventory.utils';

export const POST = withApiWrapper(async (req) => {
  await requirePermission('inventory:stock:manage');
  const user = await getAuthenticatedUser();
  const body = await req.json();
  const data = stockReceiptSchema.parse(body);

  const result = await InventoryService.receiveStock({ ...data, userId: user!.id });
  return NextResponse.json({
    balance: toSafeBalance(result.balance),
    movement: toSafeMovement(result.movement)
  }, { status: 201 });
});
