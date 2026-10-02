# Phase 4 — Inventory

## Subphase 4.1: Inventory Domain and Database Models

This document details the architectural decisions and database structures introduced to handle inventory management independently of catalogue definitions.

### 1. Domain Definitions

- **Inventory Location (`InventoryLocation`)**: Physical or virtual locations holding stock (e.g. "Main Warehouse", "Shop Front"). They are uniquely identifiable by `code`.
- **Inventory Balance (`InventoryBalance`)**: Denotes the absolute current quantity on hand and reserved amounts for a specific `ProductVariant` at a specific `InventoryLocation`.
- **Stock Movement (`StockMovement`)**: An immutable, append-only ledger entry documenting exactly why, when, and how a balance changed (e.g. `RECEIPT`, `ISSUE`, `POSITIVE_ADJUSTMENT`).
- **Stock Transfer (`StockTransfer`)**: Captures atomic transitions of stock between a `source` and `destination` location. 

### 2. Entity Relationship Diagram

```mermaid
erDiagram
    InventoryLocation ||--o{ InventoryBalance : "holds"
    InventoryLocation ||--o{ StockMovement : "records"
    ProductVariant ||--o{ InventoryBalance : "has"
    ProductVariant ||--o{ StockMovement : "affected by"
    User ||--o{ StockMovement : "authorizes"
    
    StockTransfer }o--|| InventoryLocation : "from Source"
    StockTransfer }o--|| InventoryLocation : "to Destination"
    StockTransfer ||--o{ StockMovement : "linked to"

    InventoryBalance {
        Decimal quantity
        Decimal reserved
    }
    StockMovement {
        MovementType type
        Decimal quantity
        String reason
        String reference
    }
```

### 3. Identity and Separation
Inventory balances completely segregate the `quantity` semantics from the `ProductVariant`. This allows:
- A `ProductVariant` to exist with `0` stock.
- A `ProductVariant` to have multiple balances distributed among numerous locations.
- **Constraints**: The combination of `[variantId, locationId]` is strictly unique in `InventoryBalance`.

### 4. Quantity Representation (Fractions)
Quantities are modeled as PostgreSQL `Decimal(12, 3)` instead of `Int`. 
- **Reasoning:** In plumbing and sanitaryware, items like pipes or cables might be sold or stored in fractional meters (e.g., `1.5` meters).
- **Precision:** 3 decimal places ensures safe handling of fractional measurements while preventing floating-point drift.
- **Rules:** By domain convention, balances can hold up to 3 decimal places. Validation schemas (`z.number()`) strictly coerce these decimal mappings back to Javascript numbers for client consumption safely.

### 5. Archival and Restricted Deletions
- `onDelete: Restrict` is universally enforced from `InventoryBalance` and `StockMovement` pointing to `ProductVariant` and `InventoryLocation`.
- If a `ProductVariant` is archived (`isActive = false`), its historical `StockMovements` and existing `InventoryBalances` are strictly retained to preserve ledger integrity.

### 6. Validation Schemas
Foundational Zod schemas (`src/features/inventory/inventory.validation.ts`) were introduced to guarantee strict input bounds for future Service endpoints:
- `locationSchema` requires unique strings for `code`.
- `balanceSchema` explicitly sets `.min(0)`—negative physical stock limits are blocked at the domain boundary.
- `stockMovementSchema` validates that `quantity` is strictly `.positive()` magnitude. The `MovementType` dictates whether the balance ultimately increments or decrements.

### 7. Future Commit Boundaries (Transactions)
When the Service Layer is implemented in Subphase 4.2, any operation that updates `InventoryBalance` MUST simultaneously append a `StockMovement` in the exact same `prisma.$transaction`. Concurrency conflicts will be inherently protected by standard SQL locks or explicit `update` assertions.

### 8. Testing
- `tests/integration/inventory-model.test.ts` implemented.
- Verifies that `ProductVariant` deletion throws foreign key errors when balances exist.
- Validates decimal fraction insertions logic cleanly (`100.5`).
- Passed via `vitest`.
