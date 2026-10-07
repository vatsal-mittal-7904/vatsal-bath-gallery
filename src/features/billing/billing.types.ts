import { Customer, Estimate, EstimateLine, Bill, BillLine, Payment } from '@prisma/client';
import { SafeInventoryLocation } from '../inventory/inventory.types';

export type SafeCustomer = Omit<Customer, 'createdAt' | 'updatedAt'>;

export type SafeEstimateLine = Omit<EstimateLine, 'quantity' | 'unitRate' | 'discountAmount' | 'taxRate' | 'taxAmount' | 'subtotal' | 'lineAmount'> & {
  quantity: string;
  unitRate: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
  lineAmount: string;
};

export type SafeEstimate = Omit<Estimate, 'createdAt' | 'updatedAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'grandTotal'> & {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  version: number;
  parchaJob?: {
    id: string;
    originalFilename: string;
    status: string;
  } | null;
  lines?: SafeEstimateLine[];
  customer?: SafeCustomer;
};

export interface SafeBillLineProfit {
  unitCost: string;
  totalCost: string;
  grossProfit: string;
  marginPercentage: string;
}

export interface SafeBillProfit {
  totalCost: string;
  totalRevenue: string;
  grossProfit: string;
  marginPercentage: string;
}

export type SafeBillLine = Omit<BillLine, 'quantity' | 'unitRate' | 'discountAmount' | 'taxRate' | 'taxAmount' | 'subtotal' | 'lineAmount'> & {
  quantity: string;
  unitRate: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
  lineAmount: string;
  profit?: SafeBillLineProfit;
};

export type SafeBill = Omit<Bill, 'createdAt' | 'updatedAt' | 'subtotal' | 'discountTotal' | 'taxTotal' | 'grandTotal' | 'amountPaid' | 'balanceDue'> & {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  lines?: SafeBillLine[];
  customer?: SafeCustomer;
  location?: SafeInventoryLocation | null;
  estimate?: {
    id: string;
    estimateNumber: string;
  } | null;
  profit?: SafeBillProfit;
};

export type SafePayment = Omit<Payment, 'createdAt' | 'updatedAt' | 'amount'> & {
  amount: string;
};
