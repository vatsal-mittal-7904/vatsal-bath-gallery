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

## Subphase 2.2: Secure Login and Logout

### Session Strategy
- **Stateful Sessions**: Opaque session tokens (32 bytes = 256 bits of entropy) are generated server-side.
- **Storage**: The raw token is stored in the browser as an `HttpOnly` cookie. The database (`Session` model) stores an SHA-256 hash of the token. This ensures that even if the database is exposed, active sessions cannot be hijacked because the raw tokens are unrecoverable.
- **Lifecycle**: Sessions expire in 7 days. Enforced server-side.

### Password Security
- **Algorithm**: `Argon2id` via the `argon2` Node package.
- **Verification**: Strict failure checks using generic error messages (`401 Unauthorized`) so attackers cannot determine if an email is registered or a password is correct based on distinct error outputs.

### Cookie Configuration
- Cookies are locked down with `HttpOnly`, `SameSite: Lax`, and `Path: /`.
- In production (`NODE_ENV=production`), cookies are additionally flagged as `Secure` and rely on the `__Host-` prefix for strict origin binding.

### API Endpoints
1. `POST /api/v1/auth/login`: Accepts `{ email, password }`. Generates session.
2. `POST /api/v1/auth/logout`: Revokes database session and clears cookie.
3. `GET /api/v1/auth/me`: Validates session cookie, returns current `SafeUser`.

### Security Protections
- **First-Run OWNER Setup**: The first OWNER is generated safely using the CLI script `npm run setup:owner`. It runs a transaction that locks table insertion, guaranteeing only one initial OWNER is ever generated without committing passwords.
- **Rate Limiting**: An in-memory IP-based rate limiter restricts logins (5 attempts per 5 minutes by default).
- **CSRF Defense**: Along with `SameSite: Lax`, endpoints strictly reject cross-origin state changes by enforcing the `Origin` header matches `APP_BASE_URL`.

### Testing
Fully covered with integration/unit tests for Argon2, Rate-Limiting, and Session creation/validation/revocation inside `tests/integration/auth.test.ts` and `tests/unit/password.test.ts`.
