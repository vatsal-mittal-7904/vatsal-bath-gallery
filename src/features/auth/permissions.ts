import { Role } from '@prisma/client';

export type Permission = 
  | 'dashboard:read'
  | 'catalogue:read' | 'catalogue:create' | 'catalogue:update' | 'catalogue:archive'
  | 'inventory:read'
  | 'inventory:locations:manage'
  | 'inventory:stock:manage'
  | 'inventory:transfer:manage'
  | 'inventory:read' | 'inventory:adjust' | 'inventory:manage'
  | 'customers:read' | 'customers:create' | 'customers:update' | 'customers:delete'
  | 'estimates:read' | 'estimates:create' | 'estimates:update' | 'estimates:delete'
  | 'invoices:read' | 'invoices:create' | 'invoices:update' | 'invoices:cancel'
  | 'payments:read' | 'payments:record' | 'payments:manage'
  | 'reports:read' | 'reports:profit:read'
  | 'catalogue:cost:read'
  | 'users:read' | 'users:create' | 'users:update' | 'users:deactivate' | 'users:role:update'
  | 'settings:read' | 'settings:update'
  | 'audit:read'
  | 'parcha:read' | 'parcha:upload';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'dashboard:read',
    'catalogue:read', 'catalogue:create', 'catalogue:update', 'catalogue:archive',
    'inventory:read', 'inventory:locations:manage', 'inventory:stock:manage', 'inventory:transfer:manage', 'inventory:adjust', 'inventory:manage',
    'customers:read', 'customers:create', 'customers:update', 'customers:delete',
    'estimates:read', 'estimates:create', 'estimates:update', 'estimates:delete',
    'invoices:read', 'invoices:create', 'invoices:update', 'invoices:cancel',
    'payments:read', 'payments:record', 'payments:manage',
    'reports:read', 'reports:profit:read',
    'catalogue:cost:read',
    'users:read', 'users:create', 'users:update', 'users:deactivate', 'users:role:update',
    'settings:read', 'settings:update',
    'audit:read',
    'parcha:read', 'parcha:upload'
  ],
  STAFF: [
    'dashboard:read',
    'catalogue:read', 'catalogue:create', 'catalogue:update',
    'inventory:read', 'inventory:adjust',
    'customers:read', 'customers:create', 'customers:update',
    'estimates:read', 'estimates:create', 'estimates:update',
    'invoices:read', 'invoices:create', 'invoices:update',
    'payments:read', 'payments:record',
    'reports:read', // explicitly lacking profit/margin/cost viewing
    'parcha:read', 'parcha:upload'
  ]
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}
