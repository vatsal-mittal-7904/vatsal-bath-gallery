# Phase 2: Authentication

## Subphase 2.1: User and Role Database Models

### User Model
The `User` model acts as the core identity record for the system. It tracks basic identity information alongside application-specific metadata.
- **Fields**: 
  - `id` (UUID string)
  - `email` (Unique identifier, string)
  - `name` (Optional display name)
  - `passwordHash` (Secure storage for credentials; initially a placeholder field pending phase 2.2)
  - `role` (Role Enum)
  - `isActive` (Boolean flag for soft-deactivation instead of hard-deletion)
  - `lastLoginAt` (Nullable timestamp to track activity)
  - `createdAt`, `updatedAt` (Standard lifecycle timestamps)

### Role Model
Implemented as a native PostgreSQL `enum` containing two values:
- `OWNER`: Business owner with complete administrative access.
- `STAFF`: Employee with restricted operational access (e.g., cannot view margins or manage users).
*Note: We opted for an Enum rather than a distinct Roles/Permissions relational model as the access hierarchy is flat and well-known. Enums provide excellent type safety in Prisma and lower the query complexity.*

### Database Relationships
Currently, the `User` model is standalone. Relationships to Estimates, Invoices, and Audit logs will be introduced in their respective subphases.

### Data Protection Decisions
- Passwords are strictly designed to be stored as hashes.
- A `SafeUser` type and `toSafeUser()` utility were created to rigorously omit the `passwordHash` when passing User objects to frontend or API serialization layers.
- Raw database records are stripped before returning.

### Migration Instructions
The migration `20261002082021_user_roles` adds the `Role` enum and the `User` table enhancements. 
Run: `npm run db:migrate`

### Seed Strategy
We intentionally **did not** hardcode an initial OWNER user in `prisma/seed.ts`. Hardcoding credentials leads to security risks. Instead, the first-ever OWNER account will be securely generated via an upcoming **First-Run Setup Flow** (planned for Subphase 2.2). 

### Testing Instructions
User constraints (such as email uniqueness) and SafeUser serialization logic are tested in `tests/integration/user-model.test.ts`. 

### Future Authentication Design (Subphase 2.2)
- **Hashing**: We plan to use an industry-standard algorithm such as `Argon2id` (or `bcrypt` via the `bcryptjs` package if native deps cause issues) to hash passwords securely during the setup and registration processes.
- **Session Management**: Will likely utilize secure HTTP-only cookies storing JWTs or opaque session IDs.

### Unresolved Security Decisions
- Should STAFF members have multiple sub-roles? Currently, STAFF is treated as a monolithic role. We will need to decide if we need `CASHIER` vs `INVENTORY_MANAGER` distinct roles as the shop modules expand.
