# Phase 5.1 — Estimates and Billing Domain Models

## Overview
Phase 5.1 introduces the foundational domain models for managing sales operations: Customers, Estimates, Bills (Invoices), and Payments. The core principle of these models is strict isolation from the inventory and catalogue lifecycle to preserve historical accuracy.

## Domain Models
The following models were introduced:

### Customer
Stores minimal customer details required for sales documents.
- Normalizes core data (`name`, `phoneNumber`).
- `email`, `billingAddress`, `gstin` are optional to prevent UX friction.

### Estimate & EstimateLine
- **Status transitions**: `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED`.
- Uses `estimateNumber` with a unique constraint.
- Captures catalogue data at the time of creation into explicit snapshots (`productSnapshot`, `variantSnapshot`, `skuSnapshot`).
- The `variantId` is maintained but set to `onDelete: SetNull` so historical documents survive catalogue deletion.

### Bill & BillLine
- **Status transitions**: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- Similar snapshot structure to Estimates, ensuring immutable lines.
- Contains independent state for `amountPaid` and `balanceDue`.
- Directly links to the source `Estimate` via `estimateId` (one-to-one conversion).

### Payment
- Tracks partial or full payments applied to a specific `Bill`.
- Records standard methods (`CASH`, `UPI`, `BANK_TRANSFER`, `OTHER`).

## Design Decisions
1. **No Stock Deductions:** To comply with Phase 5.1 boundaries, Estimates and Bills do NOT deduct from stock balances, check availability, or interact with `InventoryBalance` or `StockMovement` records.
2. **Decimal Handling:** All quantity and monetary fields use `Decimal` natively in PostgreSQL (e.g. `Decimal(12, 3)` for quantity to support fractional units). At the JSON boundary, they are validated and serialized strictly as `string` literals (using a Zod regex for validity) rather than unsafe JS floats.
3. **Data Integrity:** Used `onDelete: SetNull` or `onDelete: Restrict` where appropriate, rather than `Cascade`, so document lines are never silently deleted if a product is archived or removed.
4. **Permissions Configuration:** Validated that `OWNER` and `STAFF` roles map seamlessly to existing `estimates:manage` / `invoices:read` boundaries established in `permissions.ts`.

## Constraints & Further Work
- This phase implements domain persistence logic and boundaries exclusively. API routes and front-end UIs for these models are out of scope and deferred to subsequent phases.
- Automatic Estimate-to-Bill snapshot copy logic should be handled directly inside the Service Layer during subphase 5.2.

## Phase 5.2 — Estimate and Billing Service Layer and APIs

### Service Architecture
- **CustomerService**: Handles creation, retrieval, bounded pagination, search, updates, and archival. Archived customers are retained to preserve historical billing relationships.
- **EstimateService**: Manages the Estimate lifecycle, validates incoming data and custom lines, snaps catalog variables safely, triggers calculation rules, and manages transitions cleanly.
- **BillService**: Handles independent bill creation and enforces atomic Estimate-to-Bill conversions.
- **PaymentService**: Handles partial/full payments via exact Atomic increments leveraging Prisma `decrement` and `increment` safely. Supports strict bounds forbidding overpayments natively.
- **BillingCalculationService**: Validates input quantities and prices strictly against Decimal logic preventing floating point faults natively. Enforces correct bounds for Discounts and Tax calculations at both line and document tiers.
- **DocumentSequenceService**: Guarantees unique document IDs utilizing atomic `upsert` and `increment` functions.

### Endpoints Implemented
#### Customers
- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/[id]`
- `PATCH /api/v1/customers/[id]`
- `POST /api/v1/customers/[id]/archive`

#### Estimates
- `GET /api/v1/estimates`
- `POST /api/v1/estimates`
- `GET /api/v1/estimates/[id]`
- `PATCH /api/v1/estimates/[id]`
- `POST /api/v1/estimates/[id]/status`
- `POST /api/v1/estimates/[id]/convert`

#### Bills
- `GET /api/v1/bills`
- `POST /api/v1/bills`
- `GET /api/v1/bills/[id]`
- `PATCH /api/v1/bills/[id]`
- `POST /api/v1/bills/[id]/status`

#### Payments
- `GET /api/v1/bills/[id]/payments`
- `POST /api/v1/bills/[id]/payments`

### Key Invariants & Concurrency
- **Idempotency Keys**: Validated securely via header evaluation directly into Prisma `@unique` indices. Present across Estimates, Bills, Payments, and conversion triggers natively.
- **Estimate-to-Bill Conversion**: Safely guaranteed as a 1:1 transition via DB-bound unique index `estimateId` coupled to atomic `updateMany` pre-flight triggers checking allowed statuses (e.g., `ACCEPTED`).
- **Payment Balances**: Safely locked against overpayment leveraging Prisma internal transaction failures triggering rollback constraints directly within the service. 
- **Inventory Boundary**: Explicitly excluded tracking, bounds limits, checks, or inventory interactions seamlessly matching project specs. Quantities are explicitly stored on historical snapshot logic securely.

## Phase 5.3 — Estimate and Billing UI

### Pages and Components Implemented
- **Customers**: `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit` for listing, creating, archiving, and editing customers.
- **Estimates**: `/estimates`, `/estimates/new`, `/estimates/[id]` for listing estimates, creating an estimate with catalogue integration, displaying calculated lines, managing the estimate lifecycle (DRAFT -> SENT -> ACCEPTED), and converting to a bill.
- **Bills**: `/bills`, `/bills/new`, `/bills/[id]` for listing bills, direct bill creation, and handling lifecycle status.
- **Payments**: Payment history and recording form integrated natively within the `/bills/[id]` page, displaying real-time balance calculations.

### Frontend Features
- Integrated UI bounds restricting visibility strictly based on Role permissions natively injected via `useAuth` and API response filters.
- Reused `Card`, `Button`, `Input`, and `Spinner` components maintaining layout styles and Tailwind dependencies.
- Added client-side line item editor preventing sub-cents and automatically mapping variants into precise snapshots.
- Utilized IDEMPOTENCY KEY injection directly on submit methods securely preventing repeat creations on double clicks.

### Final Line-Amount Rounding Rules (Ceiling)
The business rules state that **unrounded sub-cents are not valid**.
1. Line `subtotal` is explicitly rounded upwards using `Prisma.Decimal.ROUND_CEIL` representing \`Quantity * Unit Rate\`.
2. Tax and Discounts are correctly processed according to normal rules on this updated subtotal.
3. The final `lineAmount` is again rounded using `Prisma.Decimal.ROUND_CEIL` guaranteeing final representation mapping strictly exactly to the API format.
4. Line sub-decimals are physically blocked from displaying on the UI natively.

### Explicit Absence of Stock Tracking
- UI enforces no logic, checks, or bounds connecting Estimates and Bills to physical inventory records.
- Product availability handles gracefully even if Inventory lists the product out-of-stock.

## Phase 5.4 — PDF Generation and Printing

### Print and PDF Implementation Approach
- **Zero-Dependency Native Printing**: Rather than incorporating heavy dependencies like `puppeteer` or `pdfmake`, the application relies on native browser `window.print()` functionality. This natively handles rendering and exporting ("Save as PDF") while being perfectly compatible with Next.js client architectures.
- **Dedicated Print Layout**: A separate `DocumentPrintView` component renders a pristine A4-optimized page utilizing Tailwind's `@media print` utilities.
- **Dedicated API integration**: The print pages (`/bills/[id]/print` and `/estimates/[id]/print`) directly fetch data from existing API routes (`/api/v1/bills/[id]`). This identically guarantees RBAC isolation, safe data ingestion without client modification, and accurate replication of persisted historical snapshots exactly as mandated.

### Formatting and Constraints Met
- Total outputs accurately adhere strictly to the persisted `subtotal`, `taxTotal`, and `grandTotal` (which reflect `Ceiling` rounding rules).
- No new intermediate fractional exposure was added.
- The layout natively includes Shop Information securely extracted from local variables rather than uncontrolled UI inputs.
- Payment balances dynamically reflect precisely alongside history securely maintaining data integrity.
- Tests confirm robust unit rendering utilizing native `Intl.NumberFormat('en-IN')` producing correct Rupees (`₹`) output dynamically.
