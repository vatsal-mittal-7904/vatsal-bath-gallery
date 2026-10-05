/* eslint-disable */
import { InventoryLocation, InventoryBalance, StockMovement, StockTransfer } from '@prisma/client';
import { SafeInventoryLocation, SafeInventoryBalance, SafeStockMovement, SafeStockTransfer } from './inventory.types';
import { toSafeProductVariant } from '../catalogue/catalogue.utils';

export function toSafeLocation(location: InventoryLocation): SafeInventoryLocation {
  const { createdAt, updatedAt, ...safe } = location;
  return safe;
}

export function toSafeBalance(balance: any): SafeInventoryBalance {
  const { createdAt, updatedAt, quantity, reserved, variant, location, ...safe } = balance;
  return {
    ...safe,
    quantity: quantity ? Number(quantity) : 0,
    reserved: reserved ? Number(reserved) : 0,
    ...(variant && { variant: toSafeProductVariant(variant) }),
    ...(location && { location: toSafeLocation(location) })
  };
}

export function toSafeMovement(movement: any): SafeStockMovement {
  const { quantity, ...safe } = movement;
  return {
    ...safe,
    quantity: quantity ? Number(quantity) : 0,
  };
}
