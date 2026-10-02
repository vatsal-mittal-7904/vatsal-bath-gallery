import { InventoryLocation, InventoryBalance, StockMovement, StockTransfer } from '@prisma/client';

export type SafeInventoryLocation = Omit<InventoryLocation, 'createdAt' | 'updatedAt'>;

// Safe balance ensures fractional quantities are numbers for standard API consumption
export type SafeInventoryBalance = Omit<InventoryBalance, 'quantity' | 'reserved' | 'createdAt' | 'updatedAt'> & {
  quantity: number;
  reserved: number;
};

// Movement with converted quantities
export type SafeStockMovement = Omit<StockMovement, 'quantity'> & {
  quantity: number;
};

export type SafeStockTransfer = Omit<StockTransfer, 'createdAt' | 'updatedAt'>;
