import { InventoryLocation, InventoryBalance, StockMovement, StockTransfer, Prisma } from '@prisma/client';
import { SafeProductVariant } from '../catalogue/catalogue.types';

export type SafeInventoryLocation = Omit<InventoryLocation, 'createdAt' | 'updatedAt'>;

export type SafeInventoryBalance = Omit<InventoryBalance, 'quantity' | 'reserved' | 'createdAt' | 'updatedAt'> & {
  quantity: number;
  reserved: number;
  variant?: SafeProductVariant;
  location?: SafeInventoryLocation;
};

export type SafeStockMovement = Omit<StockMovement, 'quantity'> & {
  quantity: number;
};

export type SafeStockTransfer = Omit<StockTransfer, 'createdAt' | 'updatedAt'>;

export interface StockAvailabilityResult {
  variantId: string;
  locationId: string;
  requestedQuantity: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  isAvailable: boolean;
  hasBalance: boolean;
}

export interface MultiStockAvailabilityResult {
  isAllAvailable: boolean;
  items: StockAvailabilityResult[];
}

export interface DeductStockInput {
  variantId: string;
  locationId: string;
  quantity: number | string | Prisma.Decimal;
  reference?: string | null;
  reason?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
  billId?: string | null;
}

export interface DeductMultipleStockInput {
  locationId: string;
  items: Array<{
    variantId: string;
    quantity: number | string | Prisma.Decimal;
  }>;
  reference?: string | null;
  reason?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
  billId?: string | null;
}

export interface StockDeductionResult {
  balance: SafeInventoryBalance;
  movement: SafeStockMovement;
  deductedQuantity: string;
  remainingQuantity: string;
}

export interface MultiStockDeductionResult {
  deductions: StockDeductionResult[];
}
