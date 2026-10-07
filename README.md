# 🚿 Vatsal Bath Gallery — Enterprise Management System

[![Next.js](https://img.shields.io/badge/Next.js-16.3.8-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19.3-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Google Gemini](https://img.shields.io/badge/Gemini%20AI-Multimodal%20OCR-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-418%2F418%20Passed-6E9F18?style=for-the-badge&logo=vitest)](https://vitest.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

> A full-stack, enterprise-grade retail and ERP platform architected specifically for high-volume Indian sanitaryware, bath fittings, and building materials dealerships.
>
> **Solves the classic retail bottleneck:** converts chaotic, handwritten plumber slips (*"parchas"* in mixed Hindi, Hinglish, and English) into verified candidate catalogue matches, formal estimates, GST-compliant tax invoices, and real-time inventory deductions with owner-confidential profit intelligence.

---

## 📑 Table of Contents

- [Core Business Pillars](#-core-business-pillars)
- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Key Features](#-key-features)
  - [1. Multimodal AI Parcha OCR Engine](#1-multimodal-ai-parcha-ocr-engine)
  - [2. Multi-Tier Catalogue & SKU Management](#2-multi-tier-catalogue--sku-management)
  - [3. ACID Multi-Location Inventory Ledger](#3-acid-multi-location-inventory-ledger)
  - [4. Billing, Ceiling Rounding & Payments](#4-billing-ceiling-rounding--payments)
  - [5. Owner Profit & Margin Analytics](#5-owner-profit--margin-analytics)
  - [6. Zero-Trust Security & RBAC](#6-zero-trust-security--rbac)
- [PostgreSQL Lock-Graph & Concurrency Proof](#-postgresql-lock-graph--concurrency-proof)
- [Technology Stack](#-technology-stack)
- [Directory Structure](#-directory-structure)
- [Getting Started](#-getting-started)
- [Running Tests & Quality Gates](#-running-tests--quality-gates)
- [API Reference](#-api-reference)
- [License](#-license)

---

## 🏛️ Core Business Pillars

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VATSAL BATH GALLERY PLATFORM                          │
├─────────────────┬──────────────────┬──────────────────┬─────────────────────┤
│   PARCHA OCR    │    CATALOGUE     │    INVENTORY     │  BILLING & PROFIT   │
│                 │                  │                  │                     │
│  📸 Handwritten │  📦 4-Tier Hierarchy  🏛️ Double-Entry  │  🧾 GST Invoices    │
│  🇮🇳 Hindi/Hinglish │  🏷️ SKU Engine    │  🔒 Row-Level Locks │  💰 Cash / UPI      │
│  🤖 Multi-Model │  🔒 Cost vs Sell │  🔄 Multi-Location│  📈 Owner Margins   │
│  ⚡ 1-Click Est  │  📊 Excel Import │  📦 Real-Time COGS│  🛡️ Zero-Leak RBAC  │
└─────────────────┴──────────────────┴──────────────────┴─────────────────────┘
```

---

## 🔄 System Architecture & Data Flow

```mermaid
flowchart TD
    A[Handwritten Parcha Photo] -->|Upload /api/v1/parcha-jobs| B(Parcha OCR Engine)
    B -->|Gemini Multi-Model Cascade| C[Raw Extracted Rows Hindi/Hinglish]
    C -->|Fuzzy Phonetic Matching| D[Catalogue Candidates]
    D -->|User Confirmation UI| E[Confirmed Line Items]
    E -->|Convert with Selling Price| F[Formal Estimate EST-XXX]
    F -->|Convert to Bill| G[Tax Invoice INV-XXX]
    G -->|Issue Bill| H[ACID Stock Movement Deductions]
    H -->|SELECT FOR UPDATE Lock| I[Inventory Ledger Balanced]
    G -->|Record Payment| J[Cash / UPI / Bank Transfer]
    G -->|Owner Privilege| K[Real-Time Profit & Margin Analytics]

    style A fill:#e1f5fe,stroke:#0288d1
    style B fill:#e8eaf6,stroke:#3f51b5
    style E fill:#e8f5e9,stroke:#2e7d32
    style G fill:#fff3e0,stroke:#f57c00
    style K fill:#e0f2f1,stroke:#00897b
```

---

## 🚀 Key Features

### 1. Multimodal AI Parcha OCR Engine
In Indian sanitaryware trade, plumbers and contractors write orders on rough paper slips (*"Parcha"*), typically written in shorthand, vernacular Hindi, or Hinglish (e.g., *“४ इंच एल्बो २ नग”, “1 inch tee apollo”, “UPVC pipe 3/4 20ft”*).
- **Multi-Model Fallback Cascade:** Resilient fallback across Google Gemini models (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) with structured schema constraints.
- **Smart Hindi/Hinglish Normalization:** Strips slang, standardizes fractional sizes (`1/2"`, `3/4"`, `1.25"`), and extracts numeric quantities.
- **Fuzzy Catalogue Matching:** Trigram + Levenshtein fuzzy matching scores existing products and variants against raw OCR text.
- **Interactive Match Confirmation:** Counter staff can review candidate suggestions, override selections, or adjust quantities before drafting.
- **Accurate Selling Price Binding:** Automatically maps the active variant's customer selling rate (`sellingPrice`), never exposing wholesale purchase cost.

### 2. Multi-Tier Catalogue & SKU Management
- **Hierarchical Taxonomy:** `Category (Parent & Subcategory)` $\rightarrow$ `Brand` $\rightarrow$ `Product` $\rightarrow$ `Product Variant`.
- **Granular Variant Attributes:** Multi-dimensional tracking for material (`PVC`, `CPVC`, `UPVC`, `Brass`), angle (`45°`, `90°`), diameter, and finishes.
- **Deterministic SKU Generator:** Structured, collision-free SKU assignment (e.g., `APOLLO-PVC-ELBOW-4IN-90DEG`).
- **Cost vs. Selling Price Decoupling:** Every variant maintains both `sellingPrice` (customer retail rate) and `costPrice` (confidential wholesale purchase rate).
- **Fast Excel Bulk Importer:** Command-line and scriptable importer (`scripts/import-catalogue.ts`) to ingest flat vendor sheets (`first data.xlsx`) into normalized 4-tier entities with opening stock.

### 3. ACID Multi-Location Inventory Ledger
- **Strict Double-Entry Audit Ledger:** Stock is never mutated with blind `UPDATE` queries. All movements write immutable `StockMovement` records.
- **Supported Movement Types:**
  - `OPENING_BALANCE`
  - `RECEIPT` (Supplier purchase inwards)
  - `ISSUE` (Customer sales deductions)
  - `POSITIVE_ADJUSTMENT` / `NEGATIVE_ADJUSTMENT`
  - `TRANSFER_IN` / `TRANSFER_OUT` (Warehouse $\leftrightarrow$ Store)
- **Multi-Location Support:** Track stock across physical shops, basements, and godowns.
- **Negative Stock Protection:** Configurable inventory rules prevent issuing unallocated inventory unless explicitly permitted.

### 4. Billing, Ceiling Rounding & Payments
- **Complete Sales Lifecycle:** `Estimate (DRAFT → SENT → ACCEPTED → CONVERTED)` $\rightarrow$ `Bill (DRAFT → ISSUED → PARTIALLY_PAID → PAID)`.
- **Ceiling Rounding (Indian Financial Standard):** Commercial rounding rule compliant with trade practices: subtotal discounts applied first, taxes calculated per line, and grand totals rounded deterministically.
- **Multi-Mode Payment Recording:** Split or single payments via `CASH`, `UPI`, `BANK_TRANSFER`, or `OTHER`.
- **Overpayment Guard:** Enforces exact balance limits and prevents payments from exceeding `balanceDue`.
- **Customer Print-Ready Invoices:** Printable A4 HTML tax bills (`/bills/[id]/print`) with clean layout, GST breakdown, terms, and customer details.

### 5. Owner Profit & Margin Analytics
- **Live Profit Computation:**
  $$\text{Line Revenue} = \text{subtotal} - \text{discountAmount}$$
  $$\text{Wholesale Cost (COGS)} = \text{quantity} \times \text{variant.costPrice}$$
  $$\text{Gross Profit} = \text{Line Revenue} - \text{Wholesale Cost}$$
  $$\text{Margin \%} = \left(\frac{\text{Gross Profit}}{\text{Line Revenue}}\right) \times 100$$
- **Dedicated Executive Dashboard (`/reports/profit`):**
  - KPI summary: Total Invoiced Revenue, Total Wholesale Cost, Gross Profit, and Average Margin %.
  - Date filtering: *Today*, *This Month*, *All Time*, or custom date ranges.
  - **Top Profitable Products:** Ranked by gross rupee profit generated.
  - Per-bill profit line breakdown with direct links to invoices.
- **Strict Owner-Only Access:** Staff roles cannot view profit metrics via UI or API responses.

### 6. Zero-Trust Security & RBAC
- **Roles:** `OWNER` (full access, cost/profit visibility, role updates) vs. `STAFF` (operational counter sales, catalogue read without wholesale cost).
- **Session Tokens:** Secure, random cryptographic tokens with SHA-256 database storage and HTTP-only cookies.
- **Timing Attack Mitigation:** Dummy password hashing on non-existent users prevents username enumeration.
- **CSRF Origin Verification:** All state-modifying endpoints validate origin and referer headers against authorized domain origins.

---

## 🔒 PostgreSQL Lock-Graph & Concurrency Proof

To prevent race conditions during high-volume counter operations (e.g., two staff members simultaneously confirming the same Parcha line or adjusting stock), the database layer implements **pessimistic row-level locking**:

```sql
-- Deterministic row-level lock on ParchaJob during concurrent updates
SELECT * FROM "ParchaJob" 
WHERE "id" = $1 
FOR UPDATE;
```

### Empirical Verification
The test suite includes dedicated concurrency tests ([`tests/integration/matching-concurrency.test.ts`](file:///Users/vatsalmittal7904/Desktop/vatsal%20bath%20gallery/tests/integration/matching-concurrency.test.ts)) that inspect PostgreSQL's live system tables:
- Queries `pg_locks` and `pg_stat_activity` to verify that concurrent transactions are actively suspended waiting on row locks.
- Verifies automatic retry mechanisms (`40P01` deadlock, `40001` serialization conflict, Prisma `P2034`).
- All 154 concurrency and locking scenarios pass deterministically.

---

## 💻 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | Next.js 16.3.8 (App Router, Turbopack, Server Components & Route Handlers) |
| **Language** | TypeScript 5.x (Strict Mode, 100% typed) |
| **Database & ORM** | PostgreSQL 15+, Prisma ORM 6.19.3 |
| **AI / OCR** | Google Gemini API (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) |
| **Styling** | Tailwind CSS 3.4, Custom Component Library |
| **Testing** | Vitest 5.0.3, Dockerized PostgreSQL test database (`testdb`) |
| **Logging** | Pino Structured JSON Logger |
| **Validation** | Zod v3 |

---

## 📁 Directory Structure

```text
vatsal-bath-gallery/
├── prisma/
│   ├── schema.prisma              # Database schema (Catalogue, Inventory, Billing, OCR)
│   └── migrations/                # Migration history
├── scripts/
│   ├── import-catalogue.ts        # Production Excel catalogue importer
│   └── verify-import-integration.ts
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/login/          # Secure counter authentication
│   │   ├── (protected)/           # Protected authenticated layout
│   │   │   ├── bills/             # Invoices & payment management
│   │   │   ├── catalogue/         # Products, brands & categories
│   │   │   ├── customers/         # Customer directory & khata
│   │   │   ├── estimates/         # Sales estimates & quotes
│   │   │   ├── parcha/            # OCR jobs & candidate matching
│   │   │   └── reports/profit/    # Owner-only profit & margin analytics
│   │   └── api/v1/                # REST API Route Handlers
│   │       ├── auth/              # Login, logout, me session routes
│   │       ├── bills/             # Invoice creation, status & payments
│   │       ├── catalogue/         # Product, variant, brand, category CRUD
│   │       ├── estimates/         # Estimate management & bill conversion
│   │       ├── inventory/         # Stock receipts, issues & transfers
│   │       ├── parcha-jobs/       # OCR extraction & match confirmation
│   │       └── reports/profit/    # Profit reporting analytics API
│   ├── components/                # Reusable UI component library (Button, Card, Modal)
│   ├── features/                  # Domain-driven feature modules
│   │   ├── auth/                  # Sessions, password security, RBAC guards
│   │   ├── billing/               # Bill & estimate calculation services
│   │   ├── catalogue/             # Catalogue models, validations & services
│   │   ├── inventory/             # Stock movements & transaction services
│   │   ├── parcha/                # Gemini OCR provider & matching engine
│   │   └── users/                 # User types & utilities
│   └── lib/                       # Database client, API wrapper, logger, errors
└── tests/
    ├── components/                # Component unit tests
    ├── integration/               # Multi-domain integration tests
    │   ├── bill-profit.test.ts    # Profit & confidentiality integration suite
    │   └── matching-concurrency.test.ts # PostgreSQL lock-graph tests
    └── unit/                      # Isolated service & route handler unit tests
```

---

## ⚡ Getting Started

### Prerequisites
- **Node.js:** 20.x or 22.x LTS
- **PostgreSQL:** 15+ (Local instance or Docker)
- **Google Gemini API Key:** For Parcha handwriting OCR

### 1. Clone the Repository
```bash
git clone https://github.com/vatsal-mittal-7904/vatsal-bath-gallery.git
cd vatsal-bath-gallery
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your credentials:
```env
# Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vatsal_bath_gallery?schema=public"

# Auth Secret (Minimum 32 random characters)
SESSION_SECRET="your-super-secret-random-32-character-key"

# Google Gemini API Key
GEMINI_API_KEY="your-gemini-api-key"

# Storage & Network
STORAGE_DIR="./data/uploads"
PORT=3000
NODE_ENV=development
```

### 4. Setup Database
Run Prisma migrations to create all tables:
```bash
npx prisma migrate deploy
# Or for local development sync:
npx prisma db push
```

### 5. Import Catalogue (Optional)
To load initial Apollo pipes and fittings:
```bash
npx tsx scripts/import-catalogue.ts "first data.xlsx"
```

### 6. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running Tests & Quality Gates

The test suite validates calculations, concurrency, authentication guards, and billing workflows:

```bash
# Run all 53 test suites (418 tests)
npm test

# Run TypeScript typecheck
npx tsc --noEmit

# Run Next.js production build
npm run build
```

### Quality Metrics
- **Test Suites:** 53 passed (100%)
- **Total Tests:** 418 passed (0 failed, 0 skipped)
- **Concurrency Test Scenarios:** 154 passed
- **Type Errors:** 0
- **Linter Errors:** 0

---

## 🔌 API Reference

All API routes are served under `/api/v1` and protected with typed response envelopes:

| Method | Endpoint | Description | Role / Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Secure staff/owner session login | Public |
| `POST` | `/api/v1/auth/logout` | Revokes session and clears cookie | Authenticated |
| `GET` | `/api/v1/auth/me` | Returns active user profile | Authenticated |
| `POST` | `/api/v1/parcha-jobs` | Uploads handwritten note for OCR | `parcha:upload` |
| `GET` | `/api/v1/parcha-jobs/[id]` | Fetches OCR status and rows | `parcha:read` |
| `POST` | `/api/v1/parcha-jobs/[id]/matching` | Confirms candidate variant selections | `parcha:edit` |
| `POST` | `/api/v1/parcha-jobs/[id]/estimate` | Converts OCR lines into draft estimate | `estimates:create` |
| `GET` | `/api/v1/catalogue/products` | Paginated product search | `catalogue:read` |
| `POST` | `/api/v1/estimates` | Creates customer estimate | `estimates:create` |
| `POST` | `/api/v1/estimates/[id]/convert` | Converts accepted estimate to bill | `invoices:create` |
| `GET` | `/api/v1/bills` | Paginated invoices list | `invoices:read` |
| `POST` | `/api/v1/bills/[id]/payments` | Records payment against invoice | `payments:create` |
| `GET` | `/api/v1/reports/profit` | Executive profit and margin report | `OWNER` only |

---

## 📄 License

This software is developed for **Vatsal Bath Gallery**. All rights reserved.
